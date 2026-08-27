import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('.well-known')
export class WellKnownController {
  constructor(private configService: ConfigService) {}

  @Get('apple-app-site-association')
  getAppleAppSiteAssociation() {
    return {
      applinks: {
        apps: [],
        details: [
          {
            appID: '784H5W6YA8.com.circlesfera.app',
            paths: ['*'],
          },
        ],
      },
    };
  }

  @Get('assetlinks.json')
  getAssetLinks() {
    const sha256 = this.configService.get<string>('ANDROID_SHA256');

    return [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.circlesfera.app',
          sha256_cert_fingerprints: sha256 ? [sha256] : [],
        },
      },
    ];
  }
}
