import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactPaginate from 'react-paginate';
import { AxiosError } from 'axios';
import { Loader2, Search, Upload } from 'lucide-react';

import roomService from '../../services/room.service';
import { campusService } from '../../services/campus.service';
import { Room, CreateRoomDto, UpdateRoomDto } from '../../types/room.types';
import CreateRoomModal from '../../components/modals/CreateRoomModal';
import EditRoomModal from '../../components/modals/EditRoomModal';
import ViewRoomModal from '../../components/modals/ViewRoomModal';
import ImportRoomModal from '../../components/modals/ImportRoomModal';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Badge } from '../../components/ui/badge';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import CrudActionButtons from '../../components/common/CrudActionButtons';
import CreateActionButton from '../../components/common/CreateActionButton';
import { PERMISSIONS } from '../../utils/permissions';

type Campus = {
  _id: string;
  campusName: string;
};

const ITEMS_PER_PAGE = 10;

const ROOM_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'maintain', label: 'Maintain' },
];

const STATUS_BADGE_MAP: Record<string, { label: string; className: string }> = {
  available: { label: 'Available', className: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  unavailable: { label: 'Unavailable', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  maintain: { label: 'Maintain', className: 'bg-amber-50 text-amber-600 border-amber-100' },
};

const ROOM_TYPE_LABELS: Record<string, string> = {
  classroom: 'Classroom',
  lab: 'Laboratory',
  computer_lab: 'Computer Lab',
  meeting_room: 'Meeting Room',
  library: 'Library',
  auditorium: 'Auditorium',
  pseudo_room: 'Pseudo-room',
  theoretical_theatre: 'Theoretical theatre',
  virtual_room: 'Virtual room',
};

const DEFAULT_CAMPUS_NAME = 'fpt university can tho';

const normalizeText = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
};

const findDefaultCampusId = (items: Campus[]): string => {
  const exactMatch = items.find((campus) => normalizeText(campus.campusName) === DEFAULT_CAMPUS_NAME);
  if (exactMatch) {
    return exactMatch._id;
  }

  const fuzzyMatch = items.find((campus) => {
    const normalized = normalizeText(campus.campusName);
    return normalized.includes('fpt') && normalized.includes('can tho');
  });

  return fuzzyMatch?._id || 'all';
};

const RoomManagementPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [roomPendingDelete, setRoomPendingDelete] = useState<Room | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [campusFilter, setCampusFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roomTypeFilter, setRoomTypeFilter] = useState('all');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [search, setSearch] = useState('');
  const hasInitializedCampusFilter = useRef(false);
  const { toast } = useToast();

  // =========================
  // Fetch rooms & campuses
  // =========================
  const fetchData = async () => {
    try {
      setLoading(true);
      const [roomRes, campusRes] = await Promise.all([
        roomService.getAllRooms(),
        campusService.getAll(),
      ]);
      setRooms(Array.isArray(roomRes) ? roomRes : []);
      const normalizedCampuses = Array.isArray(campusRes) ? campusRes : [];
      setCampuses(normalizedCampuses);

      if (!hasInitializedCampusFilter.current) {
        setCampusFilter(findDefaultCampusId(normalizedCampuses));
        hasInitializedCampusFilter.current = true;
      }
    } catch (err) {
      const axiosError = err as AxiosError;
      console.error('Fetch error:', axiosError);
      toast({
        title: 'Error',
        description: 'Unable to load room data',
        variant: 'destructive',
      });
    } finally {
      if (!hasInitializedCampusFilter.current) {
        hasInitializedCampusFilter.current = true;
      }
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // =========================
  // Filter + search + pagination
  // =========================
  const buildings = useMemo(() => (
    Array.from(
      new Set(
        rooms
          .map((room) => room.building)
          .filter((building): building is string => Boolean(building))
      )
    ).sort((a, b) => a.localeCompare(b))
  ), [rooms]);

  const roomTypes = useMemo(() => (
    Array.from(
      new Set(
        rooms
          .map((room) => String(room.roomType || '').trim())
          .filter((roomType): roomType is string => Boolean(roomType))
      )
    ).sort((a, b) => a.localeCompare(b))
  ), [rooms]);

  const filteredRooms = rooms.filter((room) => {
    const matchesCampus =
      campusFilter === 'all' ||
      (typeof room.campusId === 'object'
        ? room.campusId._id === campusFilter
        : room.campusId === campusFilter);
    const matchesStatus = statusFilter === 'all' || room.status === statusFilter;
    const matchesRoomType = roomTypeFilter === 'all' || room.roomType === roomTypeFilter;
    const matchesBuilding = buildingFilter === 'all' || room.building === buildingFilter;
    const searchValue = search.trim().toLowerCase();
    const matchesSearch =
      !searchValue ||
      room.roomCode.toLowerCase().includes(searchValue) ||
      room.roomName.toLowerCase().includes(searchValue);
    return matchesCampus && matchesStatus && matchesRoomType && matchesBuilding && matchesSearch;
  });

  const sortedRooms = [...filteredRooms].sort((a, b) => {
    const buildingA = a.building || '';
    const buildingB = b.building || '';
    if (buildingA !== buildingB) return buildingA.localeCompare(buildingB);
    if (a.floor !== b.floor) return a.floor - b.floor;
    return a.roomCode.localeCompare(b.roomCode);
  });

  const paginatedRooms = sortedRooms.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  const pageCount = Math.ceil(sortedRooms.length / ITEMS_PER_PAGE);

  const statusCounts = rooms.reduce(
    (acc, room) => {
      if (room.status && acc[room.status as keyof typeof acc] !== undefined) {
        acc[room.status as keyof typeof acc] += 1;
      }
      return acc;
    },
    { available: 0, unavailable: 0, maintain: 0 }
  );

  useEffect(() => {
    setCurrentPage(0);
  }, [campusFilter, statusFilter, roomTypeFilter, buildingFilter, search]);

  const getBuildingLabel = (building: string | null) => {
    if (!building) {
      return '—';
    }

    return building.trim().toLowerCase() === 'outsite' ? 'Outsite' : `Building ${building}`;
  };

  const getRoomTypeLabel = (roomType?: string) => {
    if (!roomType) {
      return '—';
    }

    return ROOM_TYPE_LABELS[roomType] || roomType;
  };

  const getCampusName = (room: Room) => {
    if (room.campusId && typeof room.campusId === 'object') {
      return room.campusId.campusName ?? '-';
    }
    const campus = campuses.find((c) => c._id === room.campusId);
    return campus?.campusName || '-';
  };

  // =========================
  // CRUD handlers
  // =========================
  const handleCreate = async (data: CreateRoomDto) => {
    try {
      await roomService.createRoom(data);
      toast({
        title: 'Success',
        description: 'Room created successfully',
      });
      await fetchData();
      setIsCreateModalOpen(false);
    } catch (err) {
      const axiosError = err as AxiosError<any>;
      toast({
        title: 'Error',
        description: axiosError.response?.data?.message || 'Failed to create room',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = async (id: string, data: UpdateRoomDto) => {
    try {
      await roomService.updateRoom(id, data);
      toast({
        title: 'Success',
        description: 'Room updated successfully',
      });
      await fetchData();
      setIsEditModalOpen(false);
    } catch (err) {
      const axiosError = err as AxiosError<any>;
      toast({
        title: 'Error',
        description: axiosError.response?.data?.message || 'Failed to update room',
        variant: 'destructive',
      });
    }
  };

  const requestDeleteRoom = (room: Room) => {
    setRoomPendingDelete(room);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!roomPendingDelete || deleteLoading) return;
    try {
      setDeleteLoading(true);
      await roomService.deleteRoom(roomPendingDelete._id);
      toast({
        title: 'Success',
        description: 'Room deleted successfully',
      });
      await fetchData();
      setConfirmOpen(false);
      setRoomPendingDelete(null);
    } catch (err) {
      const axiosError = err as AxiosError<any>;
      toast({
        title: 'Error',
        description: axiosError.response?.data?.message || 'Failed to delete room',
        variant: 'destructive',
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCancelDelete = () => {
    if (deleteLoading) return;
    setConfirmOpen(false);
    setRoomPendingDelete(null);
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await roomService.updateRoomStatus(id, status);
      toast({
        title: 'Success',
        description: 'Status updated successfully',
      });
      await fetchData();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_BADGE_MAP[status] || STATUS_BADGE_MAP.unavailable;
    return (
      <Badge
        variant="outline"
        className={`border ${config.className} px-2 py-1 text-xs font-medium`}
      >
        {config.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statCards = [
    { label: 'Total Rooms', value: rooms.length, color: 'text-foreground' },
    { label: 'Available', value: statusCounts.available, color: 'text-emerald-600' },
    { label: 'Unavailable', value: statusCounts.unavailable, color: 'text-slate-700' },
    { label: 'Maintain', value: statusCounts.maintain, color: 'text-amber-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Room Management</h1>
          <p className="text-muted-foreground mt-2">
            Track, create, and manage rooms in the system
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
          <CreateActionButton
            permission={PERMISSIONS.ROOMS_CREATE}
            onClick={() => setIsCreateModalOpen(true)}
          >
            Add Room
          </CreateActionButton>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter rooms by your criteria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="room-search">Search</Label>
              <div className="relative">
                <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="room-search"
                  placeholder="Room code or room name..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Campus</Label>
              <Select value={campusFilter} onValueChange={setCampusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {campuses.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.campusName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Room Type</Label>
              <Select value={roomTypeFilter} onValueChange={setRoomTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {roomTypes.map((roomType) => (
                    <SelectItem key={roomType} value={roomType}>
                      {getRoomTypeLabel(roomType)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Building</Label>
              <Select value={buildingFilter} onValueChange={setBuildingFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {buildings.map((building) => (
                    <SelectItem key={building} value={building}>
                      {getBuildingLabel(building)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className={`text-3xl font-bold ${stat.color}`}>
                {stat.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Room List ({sortedRooms.length})</CardTitle>
          <CardDescription>Monitor, update, and manage each room in detail</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room Code</TableHead>
                  <TableHead>Room Name</TableHead>
                  <TableHead>Building/Floor</TableHead>
                  <TableHead>Room Type</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Locker</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRooms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      <p className="text-muted-foreground">No rooms found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRooms.map((room) => (
                    <TableRow key={room._id}>
                      <TableCell className="font-medium">{room.roomCode}</TableCell>
                      <TableCell>{room.roomName}</TableCell>
                      <TableCell>
                        {getBuildingLabel(room.building)}
                        {typeof room.floor === 'number' && ` · Floor ${room.floor}`}
                      </TableCell>
                      <TableCell>{getRoomTypeLabel(room.roomType)}</TableCell>
                      <TableCell>{room.capacity ? `${room.capacity} seats` : '—'}</TableCell>
                      <TableCell>{room.lockerNumber || '—'}</TableCell>
                      <TableCell>{getCampusName(room)}</TableCell>
                      <TableCell>{getStatusBadge(room.status)}</TableCell>
                      <TableCell>
                        <CrudActionButtons
                          onView={() => {
                            setSelectedRoom(room);
                            setIsViewModalOpen(true);
                          }}
                          onEdit={() => {
                            setSelectedRoom(room);
                            setIsEditModalOpen(true);
                          }}
                          onDelete={() => requestDeleteRoom(room)}
                          viewPermission={PERMISSIONS.ROOMS_READ}
                          editPermission={PERMISSIONS.ROOMS_UPDATE}
                          deletePermission={PERMISSIONS.ROOMS_DELETE}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {pageCount > 1 && (
            <div className="mt-6 flex justify-center">
              <ReactPaginate
                previousLabel="← Prev"
                nextLabel="Next →"
                breakLabel="..."
                pageCount={pageCount}
                marginPagesDisplayed={2}
                pageRangeDisplayed={3}
                onPageChange={({ selected }) => setCurrentPage(selected)}
                containerClassName="flex items-center gap-2"
                pageClassName="px-3 py-1 rounded-md border text-sm font-medium text-muted-foreground hover:bg-muted"
                activeClassName="border-primary bg-primary text-primary-foreground"
                previousClassName="px-3 py-1 rounded-md border text-sm font-medium hover:bg-muted"
                nextClassName="px-3 py-1 rounded-md border text-sm font-medium hover:bg-muted"
                disabledClassName="opacity-50 cursor-not-allowed"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      {isCreateModalOpen && (
        <CreateRoomModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={handleCreate}
          campuses={campuses}
        />
      )}

      {isEditModalOpen && selectedRoom && (
        <EditRoomModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedRoom(null);
          }}
          onSubmit={(data) => handleEdit(selectedRoom._id, data)}
          room={selectedRoom}
          campuses={campuses}
        />
      )}

      {isViewModalOpen && selectedRoom && (
        <ViewRoomModal
          isOpen={isViewModalOpen}
          onClose={() => {
            setIsViewModalOpen(false);
            setSelectedRoom(null);
          }}
          room={selectedRoom}
          onStatusChange={handleStatusChange}
        />
      )}

      {isImportModalOpen && (
        <ImportRoomModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImported={async () => {
            await fetchData();
            toast({
              title: 'Success',
              description: 'Room import completed',
            });
          }}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Room"
        description={
          roomPendingDelete
            ? `Are you sure you want to delete room ${roomPendingDelete.roomCode} - ${roomPendingDelete.roomName}?`
            : 'Confirm room deletion.'
        }
        confirmText={deleteLoading ? 'Deleting...' : 'Delete Room'}
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
};

export default RoomManagementPage;
