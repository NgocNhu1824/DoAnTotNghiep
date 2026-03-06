import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Room, RoomDocument } from '../../database/schemas/room.schema';
import { CreateRoomDto, UpdateRoomDto } from './dto';

@Injectable()
export class RoomService {
  constructor(
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
  ) {}

  private normalizeBlockedSlots(value?: number[]): number[] {
    if (!Array.isArray(value) || value.length === 0) {
      return [];
    }

    return Array.from(
      new Set(
        value
          .map((slot) => Number(slot))
          .filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 8),
      ),
    ).sort((a, b) => a - b);
  }

  async create(createRoomDto: CreateRoomDto): Promise<Room> {
    try {
      const existingRoom = await this.roomModel.findOne({ 
        roomCode: createRoomDto.roomCode 
      });
      
      if (existingRoom) {
        throw new ConflictException('Room code already exists');
      }

      const room = new this.roomModel({
        ...createRoomDto,
        blockedSlots: this.normalizeBlockedSlots(createRoomDto.blockedSlots),
        campusId: new Types.ObjectId(createRoomDto.campusId),
      });
      
      return await room.save();
    } catch (error) {
      throw error;
    }
  }

  async findAll(query?: any): Promise<Room[]> {
    const filter: any = {};
    
    if (query?.campusId) {
      filter.campusId = new Types.ObjectId(query.campusId);
    }
    
    if (query?.status) {
      filter.status = query.status;
    }
    
    if (query?.building) {
      filter.building = query.building;
    }
    
    if (query?.floor) {
      filter.floor = parseInt(query.floor);
    }
    
    if (query?.roomType) {
      filter.roomType = query.roomType;
    }
    
    if (query?.isActive !== undefined) {
      filter.isActive = query.isActive === 'true';
    }

    return await this.roomModel
      .find(filter)
      .populate('campusId')
      .populate('devices')
      .sort({ building: 1, floor: 1, roomCode: 1 })
      .exec();
  }

  async findOne(id: string): Promise<Room> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid room ID');
    }

    const room = await this.roomModel
      .findById(id)
      .populate('campusId')
      .populate('devices')
      .exec();
    
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    
    return room;
  }

  async findByRoomCode(roomCode: string): Promise<Room> {
    const room = await this.roomModel
      .findOne({ roomCode })
      .populate('campusId')
      .populate('devices')
      .exec();
    
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    
    return room;
  }

  async update(id: string, updateRoomDto: UpdateRoomDto): Promise<Room> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid room ID');
    }

    if (updateRoomDto.roomCode) {
      const existingRoom = await this.roomModel.findOne({
        roomCode: updateRoomDto.roomCode,
        _id: { $ne: id },
      });
      
      if (existingRoom) {
        throw new ConflictException('Room code already exists');
      }
    }

    const updateData: any = { ...updateRoomDto };

    if (updateRoomDto.blockedSlots !== undefined) {
      updateData.blockedSlots = this.normalizeBlockedSlots(updateRoomDto.blockedSlots);
    }

    if (updateRoomDto.campusId) {
      updateData.campusId = new Types.ObjectId(updateRoomDto.campusId);
    }

    const room = await this.roomModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate('campusId')
      .populate('devices')
      .exec();
    
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    
    return room;
  }

  async remove(id: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid room ID');
    }

    const room = await this.roomModel.findByIdAndDelete(id).exec();
    
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    
    return { message: 'Room deleted successfully' };
  }

  async updateStatus(id: string, status: string): Promise<Room> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Invalid room ID');
    }

    const validStatuses = ['available', 'occupied', 'maintenance', 'reserved'];
    if (!validStatuses.includes(status)) {
      throw new ConflictException('Invalid status value');
    }

    const room = await this.roomModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .populate('campusId')
      .populate('devices')
      .exec();
    
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    
    return room;
  }

  async getAvailableRooms(campusId?: string): Promise<Room[]> {
    const filter: any = { status: 'available', isActive: true };
    
    if (campusId) {
      filter.campusId = new Types.ObjectId(campusId);
    }

    return await this.roomModel
      .find(filter)
      .populate('campusId')
      .populate('devices')
      .sort({ building: 1, floor: 1, roomCode: 1 })
      .exec();
  }

  async getRoomsByBuilding(building: string, campusId?: string): Promise<Room[]> {
    const filter: any = { building };
    
    if (campusId) {
      filter.campusId = new Types.ObjectId(campusId);
    }

    return await this.roomModel
      .find(filter)
      .populate('campusId')
      .populate('devices')
      .sort({ floor: 1, roomCode: 1 })
      .exec();
  }

  async getRoomStatistics(campusId?: string): Promise<any> {
    const filter: any = {};
    
    if (campusId) {
      filter.campusId = new Types.ObjectId(campusId);
    }

    const total = await this.roomModel.countDocuments(filter);
    const available = await this.roomModel.countDocuments({ ...filter, status: 'available' });
    const occupied = await this.roomModel.countDocuments({ ...filter, status: 'occupied' });
    const maintenance = await this.roomModel.countDocuments({ ...filter, status: 'maintenance' });
    const reserved = await this.roomModel.countDocuments({ ...filter, status: 'reserved' });

    return {
      total,
      available,
      occupied,
      maintenance,
      reserved,
    };
  }
}
