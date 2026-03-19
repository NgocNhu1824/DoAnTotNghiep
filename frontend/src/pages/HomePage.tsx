import React from 'react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';

const HomePage: React.FC = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card title="Classrooms">
          <p className="text-gray-600 mb-4">Manage classrooms and equipment</p>
          <Button size="sm">
            View details
          </Button>
        </Card>

        <Card title="Schedules">
          <p className="text-gray-600 mb-4">Manage teaching schedules</p>
          <Button size="sm">
            View details
          </Button>
        </Card>

        <Card title="Borrowing & Returns">
          <p className="text-gray-600 mb-4">Classroom borrowing and return history</p>
          <Button size="sm">
            View details
          </Button>
        </Card>
      </div>
    </div>
  );
};

export default HomePage;
