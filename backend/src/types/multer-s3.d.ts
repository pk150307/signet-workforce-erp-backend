declare module 'multer-s3' {
  import type { S3Client } from '@aws-sdk/client-s3';
  import type { Request } from 'express';
  import type { StorageEngine } from 'multer';

  interface MulterS3Options {
    s3: S3Client;
    bucket: string | ((req: Request, file: Express.Multer.File, callback: (error: Error | null, bucket?: string) => void) => void);
    key: (req: Request, file: Express.Multer.File, callback: (error: Error | null, key?: string) => void) => void;
    acl?: string | ((req: Request, file: Express.Multer.File, callback: (error: Error | null, acl?: string) => void) => void);
    contentType?: string | ((req: Request, file: Express.Multer.File, callback: (error: Error | null, mime?: string) => void) => void);
    metadata?: (req: Request, file: Express.Multer.File, callback: (error: Error | null, metadata?: Record<string, string>) => void) => void;
    cacheControl?: string | ((req: Request, file: Express.Multer.File, callback: (error: Error | null, cacheControl?: string) => void) => void);
    serverSideEncryption?: string | ((req: Request, file: Express.Multer.File, callback: (error: Error | null, sse?: string) => void) => void);
  }

  type ContentTypeCallback = (
    req: Request,
    file: Express.Multer.File,
    callback: (error: Error | null, mime?: string) => void,
  ) => void;

  interface MulterS3 {
    (options: MulterS3Options): StorageEngine;
    AUTO_CONTENT_TYPE: ContentTypeCallback;
  }

  const multerS3: MulterS3;
  export default multerS3;
}
