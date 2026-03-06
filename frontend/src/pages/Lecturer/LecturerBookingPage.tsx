import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import bookingService from '@/services/booking.service';
import wsService from '@/services/websocket.service';
import {
	Booking,
	BookingRoomOption,
	BookingStatus,
	CreateSelfBookingDto,
} from '@/types/booking.types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

const STATUS_TEXT: Record<BookingStatus, string> = {
	pending: 'Pending',
	approved: 'Approved',
	rejected: 'Rejected',
	cancelled: 'Cancelled',
};

const STATUS_CLASS: Record<BookingStatus, string> = {
	pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
	approved: 'bg-green-50 text-green-700 border-green-200',
	rejected: 'bg-red-50 text-red-700 border-red-200',
	cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
};

const LEGACY_AUTO_CANCEL_REASON = 'lecturer đã hủy booking';

const toDateInputValue = (date = new Date()): string => {
	return date.toISOString().slice(0, 10);
};

const formatDateCell = (dateValue: string): string => {
	const parsed = new Date(dateValue);
	if (Number.isNaN(parsed.getTime())) {
		return '--';
	}
	return format(parsed, 'dd/MM/yyyy', { locale: vi });
};

const toRoomLabel = (room: BookingRoomOption): string => {
	const buildingPart = room.building ? ` - ${room.building}` : '';
	const floorPart = typeof room.floor === 'number' ? ` F${room.floor}` : '';
	return `${room.roomCode} | ${room.roomName}${buildingPart}${floorPart}`;
};

const LecturerBookingPage: React.FC = () => {
	const { toast } = useToast();
	const { user } = useAuth();
	const [bookings, setBookings] = useState<Booking[]>([]);
	const [rooms, setRooms] = useState<BookingRoomOption[]>([]);
	const [isLoadingBookings, setIsLoadingBookings] = useState(true);
	const [isLoadingRooms, setIsLoadingRooms] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [cancelingId, setCancelingId] = useState<string | null>(null);
	const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
	const [cancelBooking, setCancelBooking] = useState<Booking | null>(null);
	const [cancelReason, setCancelReason] = useState('');
	const [cancelReasonError, setCancelReasonError] = useState('');

	const [form, setForm] = useState<CreateSelfBookingDto>({
		roomId: '',
		bookingDate: toDateInputValue(),
		startTime: '07:00',
		endTime: '09:00',
		purpose: '',
	});

	const loadBookings = useCallback(async () => {
		try {
			setIsLoadingBookings(true);
			const data = await bookingService.getSelfBookings();
			setBookings(data);
		} catch (error: any) {
			toast({
				title: 'Error',
				description: error?.message || 'Cannot load your booking list',
				variant: 'destructive',
			});
		} finally {
			setIsLoadingBookings(false);
		}
	}, [toast]);

	const loadRooms = useCallback(async () => {
		if (!form.bookingDate || !form.startTime || !form.endTime) {
			setRooms([]);
			return;
		}

		try {
			setIsLoadingRooms(true);
			const data = await bookingService.getSelfRooms({
				bookingDate: form.bookingDate,
				startTime: form.startTime,
				endTime: form.endTime,
			});
			setRooms(data);

			if (form.roomId && !data.some((room) => room._id === form.roomId)) {
				setForm((prev) => ({ ...prev, roomId: '' }));
			}
		} catch (error: any) {
			setRooms([]);
			toast({
				title: 'Error',
				description: error?.message || 'Cannot load available rooms',
				variant: 'destructive',
			});
		} finally {
			setIsLoadingRooms(false);
		}
	}, [form.bookingDate, form.endTime, form.roomId, form.startTime, toast]);

	useEffect(() => {
		loadBookings();
	}, [loadBookings]);

	useEffect(() => {
		loadRooms();
	}, [loadRooms]);

	useEffect(() => {
		const socket = wsService.connect();
		const onBookingUpdated = () => {
			loadBookings();
			loadRooms();
		};

		wsService.on('booking:updated', onBookingUpdated);
		return () => {
			wsService.off('booking:updated', onBookingUpdated);
			if (socket.connected) {
				wsService.disconnect();
			}
		};
	}, [loadBookings, loadRooms]);

	const pendingCount = useMemo(
		() => bookings.filter((booking) => booking.status === 'pending').length,
		[bookings],
	);

	const validateForm = (): string | null => {
		if (!form.roomId) return 'Please select a room';
		if (!form.bookingDate) return 'Please select booking date';
		if (!form.startTime || !form.endTime) return 'Please select start and end time';
		if (form.startTime >= form.endTime) return 'End time must be later than start time';
		if (!form.purpose.trim()) return 'Please enter booking purpose';
		return null;
	};

	const handleCreateBooking = async () => {
		const errorMessage = validateForm();
		if (errorMessage) {
			toast({ title: 'Validation', description: errorMessage, variant: 'destructive' });
			return;
		}

		try {
			setIsSubmitting(true);
			await bookingService.createSelfBooking({
				roomId: form.roomId,
				bookingDate: form.bookingDate,
				startTime: form.startTime,
				endTime: form.endTime,
				purpose: form.purpose.trim(),
			});

			toast({
				title: 'Success',
				description: 'Booking request has been created',
			});

			setForm((prev) => ({
				...prev,
				roomId: '',
				purpose: '',
			}));

			await Promise.all([loadBookings(), loadRooms()]);
		} catch (error: any) {
			toast({
				title: 'Error',
				description: error?.message || 'Cannot create booking request',
				variant: 'destructive',
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	const openCancelDialog = (booking: Booking) => {
		setCancelBooking(booking);
		setCancelReason('');
		setCancelReasonError('');
		setCancelDialogOpen(true);
	};

	const handleCancelConfirm = async () => {
		if (!cancelBooking) return;

		const reason = cancelReason.trim();
		if (!reason) {
			setCancelReasonError('Please enter cancel reason');
			return;
		}

		try {
			setCancelingId(cancelBooking._id);
			await bookingService.cancelSelfBooking(cancelBooking._id, { note: reason });
			toast({
				title: 'Success',
				description: 'Booking request has been cancelled',
			});
			setCancelDialogOpen(false);
			setCancelBooking(null);
			setCancelReason('');
			setCancelReasonError('');
			await Promise.all([loadBookings(), loadRooms()]);
		} catch (error: any) {
			toast({
				title: 'Error',
				description: error?.message || 'Cannot cancel booking request',
				variant: 'destructive',
			});
		} finally {
			setCancelingId(null);
		}
	};

	const getBookingRoomText = (booking: Booking): string => {
		if (typeof booking.roomId === 'string') {
			return booking.roomId;
		}
		return `${booking.roomId.roomCode} - ${booking.roomId.roomName}`;
	};

	const getCancelReasonText = (booking: Booking): string => {
		const reason = (booking.note || '').trim();
		if (!reason) return 'No reason provided';
		if (reason.toLowerCase() === LEGACY_AUTO_CANCEL_REASON) {
			return 'No reason provided';
		}
		return reason;
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Lecturer Booking</CardTitle>
					<CardDescription>
						Create your own booking request and cancel pending requests when needed.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div className="rounded-lg border p-4">
							<p className="text-sm text-muted-foreground">Lecturer</p>
							<p className="text-base font-medium">{user?.fullName || '--'}</p>
						</div>
						<div className="rounded-lg border p-4">
							<p className="text-sm text-muted-foreground">Your Requests</p>
							<p className="text-base font-medium">{bookings.length}</p>
						</div>
						<div className="rounded-lg border p-4">
							<p className="text-sm text-muted-foreground">Pending</p>
							<p className="text-base font-medium">{pendingCount}</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Create Booking Request</CardTitle>
					<CardDescription>System returns rooms that are free for your selected date and time.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div className="space-y-2">
							<Label htmlFor="bookingDate">Booking Date</Label>
							<Input
								id="bookingDate"
								type="date"
								value={form.bookingDate}
								onChange={(event) => setForm((prev) => ({ ...prev, bookingDate: event.target.value }))}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="startTime">Start Time</Label>
							<Input
								id="startTime"
								type="time"
								value={form.startTime}
								onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="endTime">End Time</Label>
							<Input
								id="endTime"
								type="time"
								value={form.endTime}
								onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<Label>Available Room</Label>
						<Select
							value={form.roomId}
							onValueChange={(roomId) => setForm((prev) => ({ ...prev, roomId }))}
						>
							<SelectTrigger>
								<SelectValue
									placeholder={isLoadingRooms ? 'Loading available rooms...' : 'Select a room'}
								/>
							</SelectTrigger>
							<SelectContent>
								{rooms.length === 0 ? (
									<SelectItem value="__none" disabled>
										{isLoadingRooms ? 'Loading...' : 'No available room for this time'}
									</SelectItem>
								) : (
									rooms.map((room) => (
										<SelectItem key={room._id} value={room._id}>
											{toRoomLabel(room)}
										</SelectItem>
									))
								)}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="purpose">Purpose</Label>
						<Textarea
							id="purpose"
							value={form.purpose}
							onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))}
							placeholder="Describe your booking purpose"
							rows={3}
						/>
					</div>

					<div className="flex justify-end">
						<Button onClick={handleCreateBooking} disabled={isSubmitting || isLoadingRooms}>
							{isSubmitting ? 'Creating...' : 'Create Request'}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>My Booking Requests</CardTitle>
					<CardDescription>Only your own booking requests are shown here.</CardDescription>
				</CardHeader>
				<CardContent>
					{isLoadingBookings ? (
						<p className="text-sm text-muted-foreground">Loading bookings...</p>
					) : bookings.length === 0 ? (
						<p className="text-sm text-muted-foreground">No booking requests yet.</p>
					) : (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Date</TableHead>
										<TableHead>Time</TableHead>
										<TableHead>Room</TableHead>
										<TableHead>Purpose</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className="text-right">Action</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{bookings.map((booking) => (
										<TableRow key={booking._id}>
											<TableCell>{formatDateCell(booking.bookingDate)}</TableCell>
											<TableCell>{booking.startTime} - {booking.endTime}</TableCell>
											<TableCell>{getBookingRoomText(booking)}</TableCell>
											<TableCell className="max-w-[280px]">
												<p className="truncate" title={booking.purpose}>{booking.purpose}</p>
											</TableCell>
											<TableCell>
												<Badge className={STATUS_CLASS[booking.status]} variant="outline">
													{STATUS_TEXT[booking.status]}
												</Badge>
												{booking.status === 'rejected' && booking.rejectReason && (
													<p className="text-xs text-red-600 mt-1">Reason: {booking.rejectReason}</p>
												)}
												{booking.status === 'cancelled' && (
													<p className="text-xs text-slate-600 mt-1">Cancel reason: {getCancelReasonText(booking)}</p>
												)}
											</TableCell>
											<TableCell className="text-right">
												{booking.status === 'pending' ? (
													<Button
														variant="destructive"
														size="sm"
														onClick={() => openCancelDialog(booking)}
														disabled={cancelingId === booking._id}
													>
														{cancelingId === booking._id ? 'Cancelling...' : 'Cancel'}
													</Button>
												) : (
													<span className="text-xs text-muted-foreground">No action</span>
												)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			<Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Cancel Booking Request</DialogTitle>
					</DialogHeader>

					<div className="space-y-2">
						<Label htmlFor="cancel-reason">Cancel reason</Label>
						<Textarea
							id="cancel-reason"
							value={cancelReason}
							onChange={(e) => {
								setCancelReason(e.target.value);
								if (cancelReasonError) {
									setCancelReasonError('');
								}
							}}
							placeholder="Enter cancel reason"
							className="min-h-24"
						/>
						{cancelReasonError && <p className="text-sm text-red-600">{cancelReasonError}</p>}
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setCancelDialogOpen(false);
								setCancelBooking(null);
								setCancelReason('');
								setCancelReasonError('');
							}}
						>
							Close
						</Button>
						<Button
							variant="destructive"
							onClick={handleCancelConfirm}
							disabled={!cancelBooking || (cancelingId !== null && cancelingId === cancelBooking._id)}
						>
							{cancelBooking && cancelingId === cancelBooking._id ? 'Cancelling...' : 'Confirm cancel'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};

export default LecturerBookingPage;
