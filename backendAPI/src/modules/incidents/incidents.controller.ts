import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { RequireScopes } from '@/common/decorators/scopes.decorator';
import { CampusScopeGuard } from '@/common/guards/campus-scope.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { ScopeGuard } from '@/common/guards/scope.guard';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { QueryIncidentsDto } from './dto/query-incidents.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { IncidentsService } from './incidents.service';

@Controller('incidents')
@UseGuards(JwtAuthGuard, CampusScopeGuard, PermissionsGuard, ScopeGuard)
@RequireScopes('CAMPUS', 'GLOBAL')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  @RequirePermissions('incidents.read')
  async findAll(@Query() query: QueryIncidentsDto, @Req() request: any) {
    const data = await this.incidentsService.findAllForManagement(query, request.campusFilter);

    return {
      success: true,
      data,
      total: data.length,
    };
  }

  @Get(':id')
  @RequirePermissions('incidents.read')
  async findOne(@Param('id') id: string, @Req() request: any) {
    const data = await this.incidentsService.findOneForManagement(id, request.campusFilter);

    return {
      success: true,
      data,
    };
  }

  @Get(':id/images')
  @RequirePermissions('incidents.read')
  async getIncidentImages(@Param('id') id: string, @Req() request: any) {
    const data = await this.incidentsService.getIncidentImages(id, request.campusFilter);

    return {
      success: true,
      data,
      total: data.length,
    };
  }

  @Get(':id/images/:fileId/content')
  @RequirePermissions('incidents.read')
  async getIncidentImageContent(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Req() request: any,
    @Res() response: Response,
  ) {
    const { stream, fileName, mimeType } = await this.incidentsService.getIncidentImageStream(
      id,
      fileId,
      request.campusFilter,
    );

    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    stream.pipe(response);
  }

  @Patch(':id')
  @RequirePermissions('incidents.update', 'incidents.resolve')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateIncidentDto,
    @CurrentUser() currentUser: any,
    @Req() request: any,
  ) {
    const data = await this.incidentsService.updateIncident(
      id,
      dto,
      currentUser,
      request.campusFilter,
    );

    return {
      success: true,
      message: 'Incident updated successfully',
      data,
    };
  }
}
