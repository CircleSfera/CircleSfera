import AVFoundation
import Capacitor
import Photos
import PhotosUI
import UIKit
import UniformTypeIdentifiers

/// The app's own bridge, so the plugins that live in the app are registered.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PhotoLibraryPlugin())
    }
}

/// The recent photos and videos of the device for the upload step of the
/// composer. Full and limited access both count as access: with limited
/// access the person sees the items they allowed.
@objc(PhotoLibraryPlugin)
public class PhotoLibraryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotoLibraryPlugin"
    public let jsName = "PhotoLibrary"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageLimitedAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "preview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportItem", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearExports", returnType: CAPPluginReturnPromise)
    ]

    private static let maxPage = 120
    private let work = DispatchQueue(label: "com.circlesfera.photolibrary", qos: .userInitiated)

    private static func describe(_ status: PHAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "full"
        case .limited: return "limited"
        default: return "denied"
        }
    }

    private static func hasAccess() -> Bool {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        return status == .authorized || status == .limited
    }

    /// Asks the first time; afterwards answers what the person decided.
    @objc func requestAccess(_ call: CAPPluginCall) {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .notDetermined else {
            call.resolve(["access": Self.describe(status)])
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { newStatus in
            call.resolve(["access": Self.describe(newStatus)])
        }
    }

    /// Lets a person with limited access choose which items the app sees.
    @objc func manageLimitedAccess(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController else {
                call.reject("No view to show the photo selection from")
                return
            }
            PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: controller) { _ in
                call.resolve()
            }
        }
    }

    private static func fetch(kind: String) -> PHFetchResult<PHAsset> {
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        if kind == "videos" {
            options.predicate = NSPredicate(format: "mediaType == %d", PHAssetMediaType.video.rawValue)
        } else {
            options.predicate = NSPredicate(
                format: "mediaType == %d || mediaType == %d",
                PHAssetMediaType.image.rawValue,
                PHAssetMediaType.video.rawValue
            )
        }
        return PHAsset.fetchAssets(with: options)
    }

    /// A JPEG of the item at about `size` points on its longer side, as a data address.
    private static func jpeg(of asset: PHAsset, size: CGFloat, fill: Bool) -> String? {
        let options = PHImageRequestOptions()
        options.isSynchronous = true
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = true
        var result: String?
        PHImageManager.default().requestImage(
            for: asset,
            targetSize: CGSize(width: size, height: size),
            contentMode: fill ? .aspectFill : .aspectFit,
            options: options
        ) { image, _ in
            if let data = image?.jpegData(compressionQuality: 0.8) {
                result = "data:image/jpeg;base64," + data.base64EncodedString()
            }
        }
        return result
    }

    /// The most recent items first, a page at a time.
    @objc func recent(_ call: CAPPluginCall) {
        guard Self.hasAccess() else {
            call.reject("Access to photos not allowed", "ACCESS_DENIED")
            return
        }
        let offset = max(call.getInt("offset") ?? 0, 0)
        let limit = min(max(call.getInt("limit") ?? 60, 1), Self.maxPage)
        let kind = call.getString("kind") ?? "all"
        let size = CGFloat(call.getInt("thumbnailSize") ?? 300)

        work.async {
            let result = Self.fetch(kind: kind)
            let end = min(offset + limit, result.count)
            var items: [JSObject] = []
            if offset < end {
                for asset in result.objects(at: IndexSet(integersIn: offset..<end)) {
                    var item: JSObject = [
                        "id": asset.localIdentifier,
                        "thumbnail": Self.jpeg(of: asset, size: size, fill: true) ?? "",
                        "isVideo": asset.mediaType == .video
                    ]
                    if asset.mediaType == .video {
                        item["duration"] = asset.duration
                    }
                    items.append(item)
                }
            }
            call.resolve(["items": items, "total": result.count])
        }
    }

    /// A larger picture of one item for the top of the screen; a video gives its first frame.
    @objc func preview(_ call: CAPPluginCall) {
        guard let id = call.getString("id"),
              let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
            call.reject("Item not found", "NOT_FOUND")
            return
        }
        let size = CGFloat(call.getInt("size") ?? 1080)
        work.async {
            guard let picture = Self.jpeg(of: asset, size: size, fill: false) else {
                call.reject("The item could not be drawn", "READ_FAILED")
                return
            }
            call.resolve(["picture": picture])
        }
    }

    private static func exportFolder() throws -> URL {
        let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("composer-gallery", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    /// Copies one item into the app's cache so the composer can read it as a file.
    /// A photo becomes a JPEG the right way up; a video keeps its own format.
    @objc func exportItem(_ call: CAPPluginCall) {
        guard let id = call.getString("id"),
              let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
            call.reject("Item not found", "NOT_FOUND")
            return
        }
        let folder: URL
        do {
            folder = try Self.exportFolder()
        } catch {
            call.reject("The item could not be copied", "WRITE_FAILED")
            return
        }
        let base = UUID().uuidString

        if asset.mediaType == .image {
            let options = PHImageRequestOptions()
            options.isNetworkAccessAllowed = true
            options.deliveryMode = .highQualityFormat
            PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { data, uti, _, _ in
                guard let data = data else {
                    call.reject("The photo could not be read", "READ_FAILED")
                    return
                }
                let isGif = uti.flatMap { UTType($0) }?.conforms(to: .gif) ?? false
                let output: Data?
                let ext: String
                let mime: String
                if isGif {
                    output = data
                    ext = "gif"
                    mime = "image/gif"
                } else {
                    output = UIImage(data: data)?.jpegData(compressionQuality: 0.92)
                    ext = "jpg"
                    mime = "image/jpeg"
                }
                guard let bytes = output else {
                    call.reject("The photo could not be read", "READ_FAILED")
                    return
                }
                let file = folder.appendingPathComponent("\(base).\(ext)")
                do {
                    try bytes.write(to: file)
                    call.resolve(["path": file.absoluteString, "name": "photo-\(base).\(ext)", "mimeType": mime])
                } catch {
                    call.reject("The item could not be copied", "WRITE_FAILED")
                }
            }
            return
        }

        guard asset.mediaType == .video else {
            call.reject("Only photos and videos can be added", "UNSUPPORTED")
            return
        }
        let options = PHVideoRequestOptions()
        options.isNetworkAccessAllowed = true
        options.version = .current
        PHImageManager.default().requestAVAsset(forVideo: asset, options: options) { avAsset, _, _ in
            if let urlAsset = avAsset as? AVURLAsset {
                let ext = urlAsset.url.pathExtension.isEmpty ? "mov" : urlAsset.url.pathExtension.lowercased()
                let file = folder.appendingPathComponent("\(base).\(ext)")
                do {
                    try FileManager.default.copyItem(at: urlAsset.url, to: file)
                    let mime = UTType(filenameExtension: ext)?.preferredMIMEType ?? "video/quicktime"
                    call.resolve(["path": file.absoluteString, "name": "video-\(base).\(ext)", "mimeType": mime])
                } catch {
                    call.reject("The item could not be copied", "WRITE_FAILED")
                }
                return
            }
            // A slow-motion or edited video comes as a composition: it is exported to MP4.
            guard let avAsset = avAsset,
                  let session = AVAssetExportSession(asset: avAsset, presetName: AVAssetExportPresetHighestQuality) else {
                call.reject("The video could not be read", "READ_FAILED")
                return
            }
            let file = folder.appendingPathComponent("\(base).mp4")
            session.outputURL = file
            session.outputFileType = .mp4
            session.exportAsynchronously {
                if session.status == .completed {
                    call.resolve(["path": file.absoluteString, "name": "video-\(base).mp4", "mimeType": "video/mp4"])
                } else {
                    call.reject("The video could not be read", "READ_FAILED")
                }
            }
        }
    }

    /// Empties the copies made for the composer once they have been read.
    @objc func clearExports(_ call: CAPPluginCall) {
        if let folder = try? Self.exportFolder() {
            try? FileManager.default.removeItem(at: folder)
        }
        call.resolve()
    }
}
