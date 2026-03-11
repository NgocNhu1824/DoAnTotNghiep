import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CreatePublicIncidentDto } from './dto/create-public-incident.dto';
import { IncidentsService } from './incidents.service';
import { IncidentUploadFile } from './google-drive-storage.service';

@Controller('incidents/public')
export class IncidentsPublicController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get('rooms/:roomId')
  async getRoomMeta(@Param('roomId') roomId: string) {
    const data = await this.incidentsService.getPublicRoomMeta(roomId);
    return {
      success: true,
      data,
    };
  }

  @Post('rooms/:roomId/report')
  @UseInterceptors(
    FilesInterceptor('images', 5, {
      limits: {
        fileSize: 8 * 1024 * 1024,
      },
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(new BadRequestException('Only image files are allowed') as any, false);
          return;
        }

        callback(null, true);
      },
    }),
  )
  async reportIncident(
    @Param('roomId') roomId: string,
    @Body() dto: CreatePublicIncidentDto,
    @UploadedFiles()
    files: IncidentUploadFile[],
  ) {
    const data = await this.incidentsService.createPublicIncidentReport(roomId, dto, files || []);

    return {
      success: true,
      message: 'Incident reported successfully',
      data,
    };
  }
}
