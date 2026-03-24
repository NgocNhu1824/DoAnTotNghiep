import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Device, DeviceDocument } from '../../database/schemas/device.schema';
import { CreateDeviceDto, UpdateDeviceDto } from './dto';

@Injectable()
export class DeviceService {
  constructor(@InjectModel(Device.name) private deviceModel: Model<DeviceDocument>) {}

  async create(dto: CreateDeviceDto): Promise<Device> {
    const existing = await this.deviceModel.findOne({ deviceCode: dto.deviceCode });
    if (existing) {
      throw new ConflictException('Device code already exists');
    }

    const device = new this.deviceModel({
      ...dto,
      roomId: new Types.ObjectId(dto.roomId),
    });
    return device.save();
  }

  async findAll(query?: any): Promise<Device[]> {
    const filter: any = {};

    if (query?.roomId) {
      filter.roomId = new Types.ObjectId(query.roomId);
    }

    if (query?.deviceStatus) {
      filter.deviceStatus = query.deviceStatus;
    }

    if (query?.isActive !== undefined) {
      filter.isActive = query.isActive === 'true' || query.isActive === true;
    }

    return this.deviceModel
      .find(filter)
      .populate({ path: 'roomId', select: 'roomCode roomName building floor campusId' })
      .sort({ deviceCode: 1 })
      .exec();
  }

  async findOne(id: string): Promise<Device> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid device ID');
    }

    const device = await this.deviceModel
      .findById(id)
      .populate({ path: 'roomId', select: 'roomCode roomName building floor campusId' })
      .exec();

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return device;
  }

  async update(id: string, dto: UpdateDeviceDto): Promise<Device> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid device ID');
    }

    if (dto.deviceCode) {
      const dup = await this.deviceModel.findOne({
        deviceCode: dto.deviceCode,
        _id: { $ne: id },
      });
      if (dup) {
        throw new ConflictException('Device code already exists');
      }
    }

    const updateData: any = { ...dto };
    if (dto.roomId) {
      updateData.roomId = new Types.ObjectId(dto.roomId);
    }

    const device = await this.deviceModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate({ path: 'roomId', select: 'roomCode roomName building floor campusId' })
      .exec();

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return device;
  }

  async remove(id: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid device ID');
    }

    const deleted = await this.deviceModel.findByIdAndDelete(id).exec();
    if (!deleted) {
      throw new NotFoundException('Device not found');
    }

    return { message: 'Device deleted successfully' };
  }
}
