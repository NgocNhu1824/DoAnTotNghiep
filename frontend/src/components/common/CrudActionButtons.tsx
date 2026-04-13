import React from 'react';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import PermissionGuard from '../PermissionGuard';
import { Button } from '../ui/button';

type PermissionInput = string | string[];

type CrudActionButtonsProps = {
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  viewPermission?: PermissionInput;
  editPermission?: PermissionInput;
  deletePermission?: PermissionInput;
  viewTitle?: string;
  editTitle?: string;
  deleteTitle?: string;
  disableView?: boolean;
  disableEdit?: boolean;
  disableDelete?: boolean;
  className?: string;
  extraActions?: React.ReactNode;
  extraActionsAfter?: boolean;
};

const toPermissionArray = (value?: PermissionInput): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  return Array.isArray(value) ? value : [value];
};

const CrudActionButtons: React.FC<CrudActionButtonsProps> = ({
  onView,
  onEdit,
  onDelete,
  viewPermission,
  editPermission,
  deletePermission,
  viewTitle = 'View details',
  editTitle = 'Edit',
  deleteTitle = 'Delete',
  disableView = false,
  disableEdit = false,
  disableDelete = false,
  className = '',
  extraActions,
  extraActionsAfter = false,
}) => {
  if (!onView && !onEdit && !onDelete && !extraActions) {
    return null;
  }

  const trailingExtra = extraActionsAfter ? extraActions : null;
  const leadingExtra = extraActionsAfter ? null : extraActions;

  return (
    <div className={`flex items-center justify-end gap-2 ${className}`.trim()}>
      {leadingExtra}

      {onView && (
        <PermissionGuard permissions={toPermissionArray(viewPermission)}>
          <Button variant="ghost" size="icon" onClick={onView} title={viewTitle} disabled={disableView}>
            <Eye className="h-4 w-4" />
          </Button>
        </PermissionGuard>
      )}

      {onEdit && (
        <PermissionGuard permissions={toPermissionArray(editPermission)}>
          <Button variant="ghost" size="icon" onClick={onEdit} title={editTitle} disabled={disableEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
        </PermissionGuard>
      )}

      {onDelete && (
        <PermissionGuard permissions={toPermissionArray(deletePermission)}>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
            title={deleteTitle}
            disabled={disableDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </PermissionGuard>
      )}

      {trailingExtra}
    </div>
  );
};

export default CrudActionButtons;