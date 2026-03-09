import React from 'react';
import { useAuth } from '@/context/AuthContext';

const LecturerSelfDemoPage: React.FC = () => {
  const { user, roleDetails, permissions } = useAuth();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">Lecturer Demo - Scope SELF</h1>
        <p className="mt-2 text-gray-600">
          Demo page for lecturer scope: only reads own data.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">Role Code</p>
          <p className="text-lg font-semibold text-gray-900">{roleDetails?.roleCode || '-'}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">Scope</p>
          <p className="text-lg font-semibold text-gray-900">{roleDetails?.scope || '-'}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <p className="text-sm text-gray-500">Permissions</p>
          <p className="text-lg font-semibold text-gray-900">{permissions.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">User Information</h2>
        <div className="text-sm text-gray-700 space-y-1">
          <p>Full Name: {user?.fullName || '-'}</p>
          <p>Email: {user?.email || '-'}</p>
          <p>Campus: {user?.campusId?.campusName || '-'}</p>
        </div>
      </div>
    </div>
  );
};

export default LecturerSelfDemoPage;