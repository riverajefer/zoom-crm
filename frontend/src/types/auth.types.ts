import type { Sede, UserSedes } from './sede.types';
import type {
  EmployeePersonalData,
  EmployeeType,
  EmployeeStatus,
  ContractType,
} from './payroll-employee.types';

/** Ficha de nómina asociada al usuario (cuando el usuario es empleado). */
export type UserPayrollEmployee = EmployeePersonalData & {
  id: string;
  employeeType: EmployeeType;
  monthlySalary: string | null;
  dailyRate: string | null;
  startDate: string;
  contractEndDate: string | null;
  contractType: ContractType | null;
  status: EmployeeStatus;
  notes: string | null;
  cargo: { id: string; name: string } | null;
};

export interface User {
  id: string;
  username?: string | null;
  email?: string | null;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  profilePhoto?: string | null;
  roleId: string;
  cargoId?: string;
  /** Sede en la que entra al iniciar sesión (solo en el detalle de usuario). */
  defaultLocationId?: string | null;
  /** Sedes permitidas (solo en el detalle y la lista de usuarios). */
  locations?: { location: Pick<Sede, 'id' | 'code' | 'name' | 'type' | 'color'> }[];
  role?: {
    id: string;
    name: string;
  };
  cargo?: {
    id: string;
    name: string;
    productionArea?: {
      id: string;
      name: string;
    };
  };
  payrollEmployee?: UserPayrollEmployee | null;
  isActive?: boolean;
  mustChangePassword?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileResponse extends Partial<UserSedes> {
  user: User;
  permissions: string[];
}

export interface UpdateProfilePhotoDto {
  profilePhoto?: string;
}

export interface LoginDto {
  username: string;
  password: string;
}

export interface CreateUserDto {
  username?: string;
  email?: string;
  phone?: string;
  password: string;
  firstName?: string;
  lastName?: string;
  roleId: string;
  cargoId?: string;
  /** Sede inicial (opcional): queda como permitida y predeterminada. */
  locationId?: string;
}

export interface UpdateUserDto {
  username?: string;
  email?: string;
  phone?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  roleId?: string;
  cargoId?: string | null;
  isActive?: boolean;
}

export interface AuthResponse extends Partial<UserSedes> {
  accessToken: string;
  refreshToken: string;
  user: User;
  permissions?: string[];
}
