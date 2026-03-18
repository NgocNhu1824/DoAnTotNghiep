export const formatDate = (date: Date | string): string => {
  return new Date(date).toLocaleDateString('en-US');
};

export const formatTime = (time: string): string => {
  return time;
};

export const formatDateTime = (date: Date | string): string => {
  return new Date(date).toLocaleString('en-US');
};

export const getDayOfWeek = (day: number): string => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[day % 7];
};

export const isOverdue = (plannedTime: Date): boolean => {
  return new Date() > new Date(plannedTime);
};
