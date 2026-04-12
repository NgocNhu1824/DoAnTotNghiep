import React from 'react';
import { Plus } from 'lucide-react';

import PermissionGuard from '../PermissionGuard';
import { Button, ButtonProps } from '../ui/button';

type PermissionInput = string | string[];

type CreateActionButtonProps = Omit<ButtonProps, 'children'> & {
  permission?: PermissionInput;
  children: React.ReactNode;
  showIcon?: boolean;
  icon?: React.ReactNode;
};

const toPermissionArray = (value?: PermissionInput): string[] | undefined => {
  if (!value) {
    return undefined;
  }

  return Array.isArray(value) ? value : [value];
};

const CreateActionButton: React.FC<CreateActionButtonProps> = ({
  permission,
  children,
  showIcon = true,
  icon,
  ...buttonProps
}) => (
  <PermissionGuard permissions={toPermissionArray(permission)}>
    <Button {...buttonProps}>
      {showIcon && (icon || <Plus className="mr-2 h-4 w-4" />)}
      {children}
    </Button>
  </PermissionGuard>
);

export default CreateActionButton;