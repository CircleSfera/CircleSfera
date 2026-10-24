// The address LocalStorageProvider gives a file it saved on the server's
// disk: /uploads/<uuid>.<extension>. Production stores uploads this way, and
// nginx serves them from the same path.
export const LOCAL_UPLOAD_URL =
  /^\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/i;
