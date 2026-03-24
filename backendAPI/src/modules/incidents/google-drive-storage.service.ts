import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drive_v3, google } from 'googleapis';
import { Readable } from 'stream';

export interface UploadedDriveFile {
  driveFileId: string;
  fileName: string;
  mimeType: string;
  size?: number;
}

export interface IncidentUploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class GoogleDriveStorageService {
  private readonly logger = new Logger(GoogleDriveStorageService.name);
  private readonly folderId: string;
  private readonly credentialsPath: string;
  private readonly oauthClientId: string;
  private readonly oauthClientSecret: string;
  private readonly oauthRefreshToken: string;
  private readonly enabled: boolean;

  private driveClient: drive_v3.Drive | null = null;

  constructor(private readonly configService: ConfigService) {
    this.folderId = this.configService.get<string>('GDRIVE_INCIDENTS_FOLDER_ID') || '';
    this.credentialsPath = this.configService.get<string>('GOOGLE_APPLICATION_CREDENTIALS') || '';
    this.oauthClientId =
      this.configService.get<string>('GDRIVE_OAUTH_CLIENT_ID') ||
      this.configService.get<string>('GOOGLE_CLIENT_ID') ||
      '';
    this.oauthClientSecret =
      this.configService.get<string>('GDRIVE_OAUTH_CLIENT_SECRET') ||
      this.configService.get<string>('GOOGLE_CLIENT_SECRET') ||
      '';
    this.oauthRefreshToken = this.configService.get<string>('GDRIVE_OAUTH_REFRESH_TOKEN') || '';

    const hasServiceAccount = Boolean(this.credentialsPath);
    const hasOAuth = Boolean(
      this.oauthClientId && this.oauthClientSecret && this.oauthRefreshToken,
    );

    this.enabled = Boolean(this.folderId && (hasServiceAccount || hasOAuth));
  }

  private getClient(): drive_v3.Drive {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'Google Drive is not configured. Set GDRIVE_INCIDENTS_FOLDER_ID and either service account credentials or OAuth refresh token settings.',
      );
    }

    if (!this.driveClient) {
      const hasOAuth = Boolean(
        this.oauthClientId && this.oauthClientSecret && this.oauthRefreshToken,
      );

      if (hasOAuth) {
        const oauthClient = new google.auth.OAuth2(this.oauthClientId, this.oauthClientSecret);
        oauthClient.setCredentials({ refresh_token: this.oauthRefreshToken });

        this.driveClient = google.drive({ version: 'v3', auth: oauthClient });
        this.logger.log('Google Drive client initialized with OAuth refresh token');
        return this.driveClient;
      }

      const auth = new google.auth.GoogleAuth({
        keyFile: this.credentialsPath,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });

      this.driveClient = google.drive({ version: 'v3', auth });
      this.logger.log('Google Drive client initialized with service account');
    }

    return this.driveClient;
  }

  async uploadIncidentImage(file: IncidentUploadFile): Promise<UploadedDriveFile> {
    const client = this.getClient();

    const safeName = this.buildSafeFileName(file.originalname);

    try {
      const response = await client.files.create({
        requestBody: {
          name: safeName,
          parents: [this.folderId],
          mimeType: file.mimetype,
        },
        media: {
          mimeType: file.mimetype,
          body: Readable.from(file.buffer),
        },
        fields: 'id,name,mimeType,size',
        supportsAllDrives: true,
      });

      const data = response.data;
      if (!data.id) {
        throw new InternalServerErrorException('Drive upload failed without file id');
      }

      return {
        driveFileId: data.id,
        fileName: data.name || safeName,
        mimeType: data.mimeType || file.mimetype,
        size: data.size ? Number(data.size) : file.size,
      };
    } catch (error) {
      const message = String(error || 'unknown error');
      this.logger.error(`Upload incident image failed: ${message}`);

      if (message.includes('Service Accounts do not have storage quota')) {
        throw new ServiceUnavailableException(
          'Service account cannot upload to My Drive due to quota limits. Configure OAuth refresh token (GDRIVE_OAUTH_REFRESH_TOKEN) or use Shared Drive.',
        );
      }

      throw new InternalServerErrorException('Upload incident image to Google Drive failed');
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    const client = this.getClient();

    try {
      await client.files.delete({
        fileId,
        supportsAllDrives: true,
      });
    } catch (error) {
      this.logger.warn(`Cannot delete file ${fileId} on Drive: ${error}`);
    }
  }

  async getFileStream(fileId: string): Promise<NodeJS.ReadableStream> {
    const client = this.getClient();

    try {
      const response = await client.files.get(
        {
          fileId,
          alt: 'media',
          supportsAllDrives: true,
        },
        { responseType: 'stream' },
      );

      return response.data as NodeJS.ReadableStream;
    } catch (error) {
      this.logger.error(`Cannot load incident image stream ${fileId}: ${error}`);
      throw new InternalServerErrorException('Cannot load incident image stream from Google Drive');
    }
  }

  private buildSafeFileName(originalName: string): string {
    const timestamp = Date.now();
    const cleaned = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `incident_${timestamp}_${cleaned}`;
  }
}
