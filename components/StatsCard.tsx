import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  colorClass: string; // e.g. "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
  iconBgClass: string; // e.g. "bg-blue-600 text-white"
}

const StatsCard: React.FC<StatsCardProps> = ({ label, value, icon: Icon, colorClass, iconBgClass }) => {
  return (
    <div className={`p-6 rounded-xl shadow-sm flex items-center justify-between ${colorClass}`}>
      <div>
        <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-1 transition-colors">{value}</h3>
        <p className={`text-sm font-medium opacity-80 ${label === 'Total Payroll' ? 'text-purple-700 dark:text-purple-300' : 'text-slate-600 dark:text-slate-300'}`}>{label}</p>
      </div>
      <div className={`p-3 rounded-lg ${iconBgClass}`}>
        <Icon size={24} />
      </div>
    </div>
  );
};

export default StatsCard;