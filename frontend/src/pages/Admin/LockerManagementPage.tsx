import React, { useEffect, useState } from 'react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';
import ReactPaginate from 'react-paginate';
import { AxiosError } from 'axios';
import { toast, Slide } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { lockerService } from '../../services/locker.service';
import { campusService } from '../../services/campus.service';

import CreateLockerModal from '../../components/modals/CreateLockerModal';
import EditLockerModal from '../../components/modals/EditLockerModal';
import ViewLockerModal from '../../components/modals/ViewLockerModal';
import { LockerPayload, LockerEntity } from '../../types/locker.type';

type Campus = {
  _id: string;
  campusName: string;
};

type Solenoid = {
  id: string;
  connected: boolean;
};

const LockerManagementPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [lockers, setLockers] = useState<LockerEntity[]>([]);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [selectedLocker, setSelectedLocker] = useState<LockerEntity | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(0);
  const itemsPerPage = 4;

  const [campusFilter, setCampusFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeStatusFilter, setActiveStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  // =========================
  // Fetch lockers & campuses
  // =========================
  const fetchData = async () => {
    try {
      setLoading(true);
      console.log('Fetching lockers and campuses...');

      // Log the request payload for debugging
      console.log('Request payload:', {
        campusFilter,
        statusFilter,
        activeStatusFilter,
        search,
      });

      // Pass filters as query parameters to the backend
      const [lockerRes, campusRes] = await Promise.all([
        lockerService.findAllWithIoT({
          campusId: campusFilter !== 'all' ? campusFilter : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          isActive: activeStatusFilter !== 'all' ? activeStatusFilter === 'active' : undefined,
          search: search || undefined,
        }),
        campusService.getAll(),
      ]);

      console.log('Locker API Response:', lockerRes);
      console.log('Campus API Response:', campusRes);

      const campusMap = new Map(campusRes.map((campus) => [campus._id, campus.campusName]));

      const lockersWithId = Array.isArray(lockerRes)
        ? lockerRes.map((l: any) => ({
            ...l,
            id: l._id ?? l.id,
            campusName: campusMap.get(l.campusId) || '', // Map campusName using campusId
            solenoids: Array.isArray(l.solenoids) ? l.solenoids : [], // Normalize solenoids
          }))
        : [];
      setLockers(lockersWithId);

      setCampuses(Array.isArray(campusRes) ? campusRes : []);
    } catch (err) {
      const axiosError = err as AxiosError;
      console.error('Fetch error:', axiosError);
      alert('Unable to load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // =========================
  // Filter + search + pagination
  // =========================
  const filteredLockers = lockers.filter((locker) => {
    const matchesCampus = campusFilter === 'all' || locker.campusId === campusFilter;
    const matchesStatus = statusFilter === 'all' || locker.status === statusFilter;
    const matchesActive =
      activeStatusFilter === 'all'
        ? true
        : activeStatusFilter === 'active'
          ? locker.isActive
          : !locker.isActive;
    const matchesSearch =
      locker.lockerNumber.toString().includes(search) ||
      locker.position.toLowerCase().includes(search.toLowerCase());
    return matchesCampus && matchesStatus && matchesActive && matchesSearch;
  });

  const sortedLockers = [...filteredLockers].sort(
    (b, a) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() // Updated sorting logic for better UX
  );

  const paginatedLockers = sortedLockers.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );

  useEffect(() => {
    const totalPages = Math.ceil(filteredLockers.length / itemsPerPage);
    const lastPageIndex = Math.max(0, totalPages - 1);

    if (currentPage > lastPageIndex) {
      setCurrentPage(lastPageIndex);
    }
  }, [filteredLockers.length, currentPage]);

  // Ensure pageCount is never negative
  const pageCount = Math.max(0, Math.ceil(filteredLockers.length / itemsPerPage));

  // =========================
  // Handlers
  // =========================
  const handleCreate = async (data: LockerPayload) => {
    try {
      await lockerService.create(data);

      toast.success('Locker created successfully!', {
        position: 'top-right',
        autoClose: 3000,
        hideProgressBar: true,
        transition: Slide,
      });

      setIsCreateOpen(false);

      // Fetch the updated data to ensure consistency
      await fetchData();
    } catch (error) {
      console.error('Create error:', error);
      toast.error('Failed to create locker.', {
        position: 'top-right',
        autoClose: 3000,
        hideProgressBar: true,
        transition: Slide,
      });
    }
  };

  const handleEdit = async (data: LockerPayload) => {
    if (!selectedLocker || !selectedLocker.id) {
      toast.error('Please select a valid locker.', {
        position: 'top-right',
        autoClose: 3000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        transition: Slide,
      });
      return;
    }
    try {
      const updatedLocker = await lockerService.update(selectedLocker.id, data);
      if (!updatedLocker || !updatedLocker.id) {
        throw new Error('Invalid response from server');
      }
      setLockers((prevLockers) =>
        prevLockers.map((locker) =>
          locker.id === updatedLocker.id ? updatedLocker : locker
        )
      );
      setIsEditOpen(false);
      setSelectedLocker(null);
      toast.success('Updated successfully!', {
        position: 'top-right',
        autoClose: 3000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        transition: Slide,
      });
    } catch (error) {
      console.error('Update error:', error);
      toast.error('Update failed.', {
        position: 'top-right',
        autoClose: 3000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        transition: Slide,
      });
    }
  };

  const handleDelete = async (id: string, lockerNumber: number) => {
    if (!window.confirm(`Are you sure you want to delete locker #${lockerNumber}?`)) return;

    try {
      await lockerService.remove(id);
      toast.success(`Locker #${lockerNumber} deleted successfully!`, {
        position: 'top-right',
        autoClose: 3000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        transition: Slide,
      });
      fetchData();
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(`Failed to delete locker #${lockerNumber}.`, {
        position: 'top-right',
        autoClose: 3000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        transition: Slide,
      });
    }
  };

  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

  const getStatusColor = (status: LockerEntity['status']) => {
    const capitalizedStatus = capitalize(status);
    switch (status) {
      case 'available':
        return `text-green-600 ${capitalizedStatus}`;
      case 'occupied':
        return `text-yellow-600 ${capitalizedStatus}`;
      case 'maintenance':
        return `text-red-600 ${capitalizedStatus}`;
      default:
        return capitalizedStatus;
    }
  };

  const getBatteryColor = (batteryLevel: number) => {
    if (batteryLevel > 75) return 'text-green-600';
    if (batteryLevel > 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) return <Loading />;

  // =========================
  // Render
  // =========================
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Locker Management</h1>
        <Button onClick={() => setIsCreateOpen(true)}>+ Add locker</Button>
      </div>

      <div className="text-lg font-medium text-gray-700">
        Total lockers: {filteredLockers.length}
      </div>

      <Card>
        {/* SEARCH & FILTER */}
        <div className="flex justify-between items-center mb-4 space-x-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by locker number or position"
              className="w-full px-4 py-2 border rounded-lg"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex space-x-4">
            <select
              className="px-4 py-2 border rounded-lg"
              value={campusFilter}
              onChange={(e) => setCampusFilter(e.target.value)}
            >
              <option value="all">All campuses</option>
              {campuses.map((campus) => (
                <option key={campus._id} value={campus._id}>
                  {campus.campusName}
                </option>
              ))}
            </select>

            <select
              className="px-4 py-2 border rounded-lg"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="available">Available</option>
              <option value="occupied">Occupied</option>
              <option value="maintenance">Maintenance</option>
            </select>

            <select
              className="px-4 py-2 border rounded-lg"
              value={activeStatusFilter}
              onChange={(e) => setActiveStatusFilter(e.target.value)}
            >
              <option value="all">All activation statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300 rounded-lg">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 border border-gray-300 w-12">STT</th>
                <th className="px-4 py-2 border border-gray-300 w-24">Locker #</th>
                <th className="px-4 py-2 border border-gray-300 w-64 text-left">Position</th>
                <th className="px-4 py-2 border border-gray-300 w-64 text-left">Campus</th>
                <th className="px-4 py-2 border border-gray-300 w-32 text-center">Status</th>
                <th className="px-4 py-2 border border-gray-300 w-24 text-center">Pin</th>
                <th className="px-4 py-2 border border-gray-300 w-40 text-center">Activation Status</th>
                <th className="px-4 py-2 border border-gray-300 w-40 text-center">Solenoid Count</th>
                <th className="px-4 py-2 border border-gray-300 w-40 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLockers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-2 text-gray-500 text-center">
                    No data available
                  </td>
                </tr>
              ) : (
                paginatedLockers.map((locker, index) => (
                  <tr key={locker.id || index} className="hover:bg-gray-50">
                    <td className="px-4 py-2 border border-gray-300 text-center font-bold">
                      {currentPage * itemsPerPage + index + 1}
                    </td>
                    <td className="px-4 py-2 border border-gray-300 text-center text-blue-600">
                      {locker.lockerNumber}
                    </td>
                    <td className="px-4 py-2 border border-gray-300 text-left">
                      {locker.position}
                    </td>
                    <td className="px-4 py-2 border border-gray-300 text-left">
                      {locker.campusName}
                    </td>
                    <td className={`px-4 py-2 border border-gray-300 text-center ${getStatusColor(locker.status)}`}>
                      {capitalize(locker.status)}
                    </td>
                    <td className={`px-4 py-2 border border-gray-300 text-center ${getBatteryColor(locker.batteryLevel)}`}>
                      {locker.batteryLevel}%
                    </td>
                    <td className="px-4 py-2 border border-gray-300 text-center">
                      <span className={`px-2 py-1 rounded-lg text-white ${locker.isActive ? 'bg-green-500' : 'bg-red-500'}`}>
                        {locker.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2 border border-gray-300 text-center">
                      {locker.solenoids?.length || 0}
                    </td>
                    <td className="px-4 py-2 border border-gray-300 text-center">
                      <div className="flex justify-center space-x-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedLocker(locker);
                            setIsViewOpen(true);
                          }}
                        >
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setSelectedLocker(locker);
                            setIsEditOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(locker.id, locker.lockerNumber)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="mt-4 flex justify-center">
          <ReactPaginate
            forcePage={Math.min(currentPage, pageCount - 1)}
            pageCount={pageCount}
            onPageChange={(e: { selected: number }) => setCurrentPage(e.selected)}
            previousLabel="Previous"
            nextLabel="Next"
            containerClassName="flex space-x-2"
            activeClassName="bg-blue-500 text-white px-3 py-1 rounded"
            pageClassName="px-3 py-1 bg-gray-200 rounded"
          />
        </div>
      </Card>

      {/* MODALS */}
      <CreateLockerModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreate}
        onUpdate={async (id, data) => {
          const updated = await lockerService.update(id, data);
          setLockers((prev) =>
            prev.map((l) => (l.id === updated.id ? updated : l))
          );
          toast.success('Locker updated successfully!', {
            position: 'top-right',
            autoClose: 3000,
            hideProgressBar: true,
            transition: Slide,
          });
        }}
        campuses={campuses}
        setLockers={setLockers} // Pass setLockers to CreateLockerModal
      />
      <EditLockerModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onEdit={handleEdit}
        locker={selectedLocker ?? undefined}
        campuses={campuses}
      />
      <ViewLockerModal
        isOpen={isViewOpen}
        onClose={() => setIsViewOpen(false)}
        onEdit={() => {
          setIsViewOpen(false);
          setIsEditOpen(true);
        }}
        locker={selectedLocker ?? undefined}
      />
    </div>
  );
};

export default LockerManagementPage;