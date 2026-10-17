export interface Machine {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  productionArea?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMachineDto {
  name: string;
  description?: string;
  productionAreaId?: string;
}

export interface UpdateMachineDto extends Partial<Omit<CreateMachineDto, 'productionAreaId'>> {
  /** `null` quita el área. */
  productionAreaId?: string | null;
  isActive?: boolean;
}
