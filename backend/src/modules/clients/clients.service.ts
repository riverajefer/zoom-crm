import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ClientsRepository } from './clients.repository';
import { LocationsService } from '../locations/locations.service';
import { CreateClientDto, UpdateClientDto } from './dto';
import { FilterClientsDto } from './dto/filter-clients.dto';
import { PersonType } from '../../generated/prisma';
import { startOfDay, endOfDay } from '../../common/utils/date-range.util';
import {
  docCore,
  nameCore,
  normName,
} from '../../common/utils/normalize.util';

/** Coincidencia posible al crear un cliente, para que el frontend la pinte. */
export interface DuplicateMatch {
  id: string;
  name: string;
  document: string | null;
  /** ALTA = mismo documento y mismo nombre; MEDIA = solo documento; BAJA = solo nombre. */
  tier: 'ALTA' | 'MEDIA' | 'BAJA';
  /** `sede`: la predeterminada del asesor (solo Zoom), para saber que es cliente de otro local. */
  advisors: {
    id: string;
    name: string;
    sede: { code: string; name: string; color: string } | null;
  }[];
}

@Injectable()
export class ClientsService {
  constructor(
    private readonly clientsRepository: ClientsRepository,
    private readonly locationsService: LocationsService,
  ) {}

  /**
   * Get all clients
   */
  async findAll(filters: FilterClientsDto = {}) {
    const { createdAtFrom, createdAtTo, includeInactive } = filters;
    return this.clientsRepository.findAll({
      includeInactive,
      createdAtFrom: startOfDay(createdAtFrom),
      createdAtTo: endOfDay(createdAtTo),
    });
  }

  /**
   * Get client by ID
   */
  async findOne(id: string) {
    const client = await this.clientsRepository.findById(id);

    if (!client) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }

    return client;
  }

  /**
   * Get consolidated financial stats + order history for a client
   */
  async getClientStats(id: string) {
    const client = await this.clientsRepository.findById(id);
    if (!client) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }
    return this.clientsRepository.findClientStats(id);
  }

  /**
   * Busca clientes que probablemente sean el mismo que se está por crear.
   *
   * El documento por sí solo NO alcanza: en producción hay cédulas compartidas
   * por personas distintas (una persona y su empresa, o un dato mal digitado).
   * Por eso el nivel ALTA exige documento *y* nombre, y los demás se devuelven
   * como aviso, no como certeza.
   */
  async findDuplicates(
    input: { name?: string; nit?: string | null; cedula?: string | null },
    excludeId?: string,
  ): Promise<DuplicateMatch[]> {
    const doc = docCore(input.nit, input.cedula);
    const nn = normName(input.name);
    const nc = nameCore(input.name);
    if (!doc && !nn) return [];

    const candidates = await this.clientsRepository.findAllForDuplicateCheck(excludeId);
    const matches: DuplicateMatch[] = [];

    for (const c of candidates) {
      const cDoc = docCore(c.nit, c.cedula);
      const sameDoc = Boolean(doc) && doc === cDoc;
      const sameName =
        Boolean(nn) && (nn === normName(c.name) || (Boolean(nc) && nc === nameCore(c.name)));

      if (!sameDoc && !sameName) continue;

      matches.push({
        id: c.id,
        name: c.name,
        document: c.nit ?? c.cedula ?? null,
        tier: sameDoc && sameName ? 'ALTA' : sameDoc ? 'MEDIA' : 'BAJA',
        advisors: c.advisors.map((a) => ({
          id: a.advisor.id,
          name:
            [a.advisor.firstName, a.advisor.lastName].filter(Boolean).join(' ') ||
            a.advisor.username ||
            'Sin nombre',
          sede: a.advisor.defaultLocation ?? null,
        })),
      });
    }

    const rank = { ALTA: 3, MEDIA: 2, BAJA: 1 } as const;
    return matches.sort((a, b) => rank[b.tier] - rank[a.tier]);
  }

  /**
   * Create a new client.
   *
   * `force` deja crear pese a un posible duplicado. Existe a propósito: bloquear
   * sin salida solo lleva a que el asesor invente un documento o un "Juan Pérez 2".
   * La alternativa que ofrece el frontend es solicitar la co-propiedad del cliente
   * existente (`client-advisor-requests`), que es lo que realmente busca.
   *
   * Si el creador no es admin (no tiene `approve_client_ownership_auth`), queda
   * asignado como asesor del cliente.
   */
  async create(
    createClientDto: CreateClientDto,
    creatorId: string,
    options: { force?: boolean } = {},
  ) {
    if (!options.force) {
      const duplicates = await this.findDuplicates(createClientDto);
      if (duplicates.length > 0) {
        throw new ConflictException({
          code: 'POSSIBLE_DUPLICATE',
          message:
            'Ya existe un cliente que coincide con estos datos. Revisa si es el mismo ' +
            'antes de crear uno nuevo.',
          matches: duplicates,
        });
      }
    }

    // Validate email uniqueness if provided
    if (createClientDto.email) {
      const existingClient = await this.clientsRepository.findByEmail(
        createClientDto.email,
      );

      if (existingClient) {
        throw new BadRequestException(
          `Ya existe un cliente con el email "${createClientDto.email}"`,
        );
      }
    }

    // Validate department exists
    await this.locationsService.findDepartmentById(createClientDto.departmentId);

    // Validate city belongs to department
    const cityBelongs = await this.locationsService.validateCityBelongsToDepartment(
      createClientDto.cityId,
      createClientDto.departmentId,
    );

    if (!cityBelongs) {
      throw new BadRequestException(
        'La ciudad seleccionada no pertenece al departamento indicado',
      );
    }

    // Validate NIT for EMPRESA type
    if (createClientDto.personType === PersonType.EMPRESA && !createClientDto.nit) {
      throw new BadRequestException(
        'El NIT es requerido para clientes de tipo EMPRESA',
      );
    }

    // Set NIT and Cedula based on personType
    const nit = createClientDto.personType === PersonType.NATURAL ? null : createClientDto.nit;
    const cedula = createClientDto.personType === PersonType.EMPRESA ? null : createClientDto.cedula;

    // Determine advisor set:
    //   - non-admin users become an advisor of the client automatically
    //   - admins may pass an explicit list of advisorIds (or none)
    const creator = await this.clientsRepository.findUserWithPermissions(creatorId);
    const isAdmin = creator?.role?.permissions?.some(
      (rp) => rp.permission.name === 'approve_client_ownership_auth',
    );

    const advisorIds = isAdmin
      ? [...new Set(createClientDto.advisorIds ?? [])]
      : [creatorId];

    if (createClientDto.employeeId) {
      await this.assertEmployeeAvailable(createClientDto.employeeId);
    }

    return this.clientsRepository.create({
      name: createClientDto.name,
      manager: createClientDto.manager,
      encargado: createClientDto.encargado,
      phone: createClientDto.phone,
      landlinePhone: createClientDto.landlinePhone,
      address: createClientDto.address,
      email: createClientDto.email,
      personType: createClientDto.personType,
      nit,
      cedula,
      department: { connect: { id: createClientDto.departmentId } },
      city: { connect: { id: createClientDto.cityId } },
      ...(createClientDto.employeeId && {
        employee: { connect: { id: createClientDto.employeeId } },
      }),
      ...(advisorIds.length > 0 && {
        advisors: {
          create: advisorIds.map((advisorId) => ({
            advisor: { connect: { id: advisorId } },
          })),
        },
      }),
    });
  }

  /**
   * Valida el vínculo con una ficha de nómina antes de guardarlo.
   *
   * La columna es `@unique`, así que sin esta comprobación el usuario recibiría
   * un P2002 crudo. Y el P2002 llega con `meta.target` vacío por el adaptador de
   * pg, de modo que ni siquiera se podría identificar de qué restricción se
   * trata: mejor rechazarlo acá, con el nombre del cliente que ya lo tiene.
   */
  private async assertEmployeeAvailable(
    employeeId: string,
    excludeClientId?: string,
  ) {
    const employee = await this.clientsRepository.findEmployeeWithClient(employeeId);

    if (!employee) {
      throw new BadRequestException(
        'La ficha de empleado seleccionada no existe',
      );
    }

    if (
      employee.clientProfile &&
      employee.clientProfile.id !== excludeClientId
    ) {
      throw new BadRequestException(
        `Ese empleado ya está vinculado al cliente "${employee.clientProfile.name}". ` +
          'Un empleado solo puede tener una ficha de cliente, o se le terminaría ' +
          'descontando dos veces.',
      );
    }
  }

  /**
   * Update a client
   */
  async update(id: string, updateClientDto: UpdateClientDto) {
    // Verify client exists
    const existingClient = await this.findOne(id);

    // If email is being changed, check for duplicates
    if (updateClientDto.email && updateClientDto.email !== existingClient.email) {
      const clientWithEmail = await this.clientsRepository.findByEmailExcludingId(
        updateClientDto.email,
        id,
      );

      if (clientWithEmail) {
        throw new BadRequestException(
          `Ya existe un cliente con el email "${updateClientDto.email}"`,
        );
      }
    }

    // If department is being changed, validate it exists
    if (updateClientDto.departmentId) {
      await this.locationsService.findDepartmentById(updateClientDto.departmentId);
    }

    // If city or department is being changed, validate city belongs to department
    const finalDepartmentId = updateClientDto.departmentId || existingClient.departmentId;
    const finalCityId = updateClientDto.cityId || existingClient.cityId;

    if (updateClientDto.cityId || updateClientDto.departmentId) {
      const cityBelongs = await this.locationsService.validateCityBelongsToDepartment(
        finalCityId,
        finalDepartmentId,
      );

      if (!cityBelongs) {
        throw new BadRequestException(
          'La ciudad seleccionada no pertenece al departamento indicado',
        );
      }
    }

    // Determine final personType
    const finalPersonType = updateClientDto.personType || existingClient.personType;

    // Validate NIT for EMPRESA type
    if (finalPersonType === PersonType.EMPRESA) {
      const finalNit = updateClientDto.nit !== undefined ? updateClientDto.nit : existingClient.nit;
      if (!finalNit) {
        throw new BadRequestException(
          'El NIT es requerido para clientes de tipo EMPRESA',
        );
      }
    }

    // Build update data
    const updateData: any = {};

    if (updateClientDto.name !== undefined) updateData.name = updateClientDto.name;
    if (updateClientDto.manager !== undefined) updateData.manager = updateClientDto.manager;
    if (updateClientDto.encargado !== undefined) updateData.encargado = updateClientDto.encargado;
    if (updateClientDto.phone !== undefined) updateData.phone = updateClientDto.phone;
    if (updateClientDto.landlinePhone !== undefined) updateData.landlinePhone = updateClientDto.landlinePhone;
    if (updateClientDto.address !== undefined) updateData.address = updateClientDto.address;
    if (updateClientDto.email !== undefined) updateData.email = updateClientDto.email;
    if (updateClientDto.personType !== undefined) updateData.personType = updateClientDto.personType;
    if (updateClientDto.isActive !== undefined) updateData.isActive = updateClientDto.isActive;

    // `null` explícito desvincula al empleado; `undefined` deja el vínculo como
    // está. Son casos distintos y el `!== undefined` es lo que los separa.
    if (updateClientDto.employeeId !== undefined) {
      if (updateClientDto.employeeId) {
        await this.assertEmployeeAvailable(updateClientDto.employeeId, id);
        // Va anidado, NO como escalar `employeeId`: el update de Prisma es la
        // variante "checked" y rechaza la llave foránea suelta cuando el modelo
        // declara la relación (`Unknown argument employeeId`). `updateData` es
        // `any`, así que TypeScript no lo detecta: revienta en runtime.
        updateData.employee = {
          connect: { id: updateClientDto.employeeId },
        };
      } else {
        // `null` explícito desvincula. `disconnect` es la forma anidada de
        // poner la columna en NULL.
        updateData.employee = { disconnect: true };
      }
    }

    // Handle NIT and Cedula based on personType
    if (updateClientDto.nit !== undefined) {
      updateData.nit = finalPersonType === PersonType.NATURAL ? null : updateClientDto.nit;
    } else if (updateClientDto.personType === PersonType.NATURAL) {
      updateData.nit = null;
    }

    if (updateClientDto.cedula !== undefined) {
      updateData.cedula = finalPersonType === PersonType.EMPRESA ? null : updateClientDto.cedula;
    } else if (updateClientDto.personType === PersonType.EMPRESA) {
      updateData.cedula = null;
    }

    // Handle department/city updates
    if (updateClientDto.departmentId) {
      updateData.department = { connect: { id: updateClientDto.departmentId } };
    }
    if (updateClientDto.cityId) {
      updateData.city = { connect: { id: updateClientDto.cityId } };
    }

    // Handle advisor set (co-ownership): replace the full set with the provided list.
    // Only admins reach this branch — the controller/frontend gate the field.
    if (updateClientDto.advisorIds !== undefined) {
      const advisorIds = [...new Set(updateClientDto.advisorIds)];
      updateData.advisors = {
        deleteMany: {},
        create: advisorIds.map((advisorId) => ({
          advisor: { connect: { id: advisorId } },
        })),
      };
    }

    return this.clientsRepository.update(id, updateData);
  }

  /**
   * Update only the special condition field of a client.
   * Requires the 'update_client_special_condition' permission (enforced in controller).
   */
  async updateSpecialCondition(id: string, specialCondition?: string | null) {
    await this.findOne(id);
    return this.clientsRepository.updateSpecialCondition(id, specialCondition ?? null);
  }

  /**
   * Soft delete a client
   */
  async remove(id: string) {
    // Verify client exists
    await this.findOne(id);

    // Soft delete
    await this.clientsRepository.update(id, { isActive: false });

    return { message: `Cliente con ID ${id} eliminado correctamente` };
  }

  /**
   * Bulk upload clients from a CSV buffer.
   * Parses, validates each row, resolves department/city names to IDs,
   * and inserts all valid rows in a single transaction.
   * Invalid rows are collected as errors in the response.
   */
  async uploadClients(csvBuffer: Buffer) {
    // --- PHASE 1: Parse CSV ---
    const csvString = csvBuffer.toString('utf-8').replace(/^\uFEFF/, ''); // strip BOM
    const lines = csvString
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      throw new BadRequestException(
        'El CSV debe tener al menos una fila de cabeceras y una fila de datos',
      );
    }

    const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
    const requiredHeaders = ['name', 'phone', 'personType', 'department', 'city'];
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Cabeceras faltantes en el CSV: ${missingHeaders.join(', ')}`,
      );
    }

    // Parse a CSV line respecting quoted fields
    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    // Map header name → column index
    const headerIndex = new Map<string, number>();
    headers.forEach((h, i) => headerIndex.set(h, i));

    const getField = (values: string[], fieldName: string): string => {
      const idx = headerIndex.get(fieldName);
      return idx !== undefined && values[idx] !== undefined
        ? values[idx].replace(/^["']|["']$/g, '')
        : '';
    };

    // --- PHASE 2: Validate rows and resolve locations ---
    const errors: { row: number; error: string }[] = [];
    const validatedRows: Array<{
      name: string;
      email?: string | null;
      phone: string;
      personType: PersonType;
      departmentId: string;
      cityId: string;
      nit: string | null;
      cedula: string | null;
      manager: string | null;
      encargado: string | null;
      landlinePhone: string | null;
      address: string | null;
    }> = [];

    // Pre-load departments into a map (1 query)
    const allDepartments = await this.locationsService.findAllDepartments();
    const deptMap = new Map<string, { id: string; name: string }>();
    for (const dept of allDepartments) {
      deptMap.set(dept.name.toLowerCase(), { id: dept.id, name: dept.name });
    }

    // Pre-load existing emails into a set (1 query)
    const existingEmails = new Set(
      (await this.clientsRepository.findAllEmails()).map((e) => e.toLowerCase()),
    );

    // Track emails seen within the CSV to detect intra-file duplicates
    const seenEmails = new Set<string>();

    // Lazy city cache: `${departmentId}:${cityNameLower}` → cityId
    const cityCache = new Map<string, string>();

    const dataLines = lines.slice(1);

    for (let i = 0; i < dataLines.length; i++) {
      const rowNumber = i + 2; // row 1 = headers
      const values = parseCsvLine(dataLines[i]);
      const rowErrors: string[] = [];

      const name = getField(values, 'name');
      const email = getField(values, 'email') || null;
      const phone = getField(values, 'phone');
      const personTypeRaw = getField(values, 'personType');
      const departmentName = getField(values, 'department') || 'Cundinamarca';
      const cityName = getField(values, 'city') || 'Bogotá';
      const nit = getField(values, 'nit') || null;
      const cedula = getField(values, 'cedula') || null;
      const manager = getField(values, 'manager') || null;
      const encargado = getField(values, 'encargado') || null;
      const landlinePhone = getField(values, 'landlinePhone') || null;
      const address = getField(values, 'address') || null;

      // Required field validations
      if (!name || name.length < 2 || name.length > 200) {
        rowErrors.push('name es requerido (2-200 caracteres)');
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        rowErrors.push('email tiene formato inválido');
      }
      if (!phone || phone.length < 10 || phone.length > 20) {
        rowErrors.push('phone es requerido (10-20 caracteres)');
      }
      if (personTypeRaw !== 'NATURAL' && personTypeRaw !== 'EMPRESA') {
        rowErrors.push('personType debe ser NATURAL o EMPRESA');
      }
      // Optional field length validations
      if (nit && (nit.length < 5 || nit.length > 20)) {
        rowErrors.push('nit debe tener entre 5 y 20 caracteres');
      }
      if (cedula && (cedula.length < 6 || cedula.length > 15)) {
        rowErrors.push('cedula debe tener entre 6 y 15 caracteres');
      }
      if (manager && manager.length > 200) {
        rowErrors.push('manager no puede exceder 200 caracteres');
      }
      if (encargado && encargado.length > 200) {
        rowErrors.push('encargado no puede exceder 200 caracteres');
      }
      if (landlinePhone && landlinePhone.length > 20) {
        rowErrors.push('landlinePhone no puede exceder 20 caracteres');
      }
      if (address && address.length > 300) {
        rowErrors.push('address no puede exceder 300 caracteres');
      }

      // Email uniqueness checks
      if (email) {
        const emailLower = email.toLowerCase();
        if (existingEmails.has(emailLower)) {
          rowErrors.push(`Email "${email}" ya existe en la base de datos`);
        } else if (seenEmails.has(emailLower)) {
          rowErrors.push(`Email "${email}" está duplicado dentro del CSV`);
        }
        seenEmails.add(emailLower);
      }

      // Resolve department name → ID
      let departmentId: string | null = null;
      if (departmentName) {
        const dept = deptMap.get(departmentName.toLowerCase());
        if (!dept) {
          rowErrors.push(`Departamento "${departmentName}" no encontrado`);
        } else {
          departmentId = dept.id;
        }
      }

      // Resolve city name → ID (only if department resolved)
      let cityId: string | null = null;
      if (cityName && departmentId) {
        const cacheKey = `${departmentId}:${cityName.toLowerCase()}`;
        if (cityCache.has(cacheKey)) {
          cityId = cityCache.get(cacheKey)!;
        } else {
          const city = await this.locationsService.findCityByNameAndDepartment(
            cityName,
            departmentId,
          );
          if (!city) {
            rowErrors.push(
              `Ciudad "${cityName}" no encontrada en el departamento "${departmentName}"`,
            );
          } else {
            cityId = city.id;
            cityCache.set(cacheKey, city.id);
          }
        }
      }

      if (rowErrors.length > 0) {
        errors.push({ row: rowNumber, error: rowErrors.join('; ') });
        continue;
      }

      validatedRows.push({
        name,
        email,
        phone,
        personType: personTypeRaw as PersonType,
        departmentId: departmentId!,
        cityId: cityId!,
        nit: personTypeRaw === 'NATURAL' ? null : nit,
        cedula,
        manager,
        encargado,
        landlinePhone,
        address,
      });
    }

    // --- PHASE 3: Insert valid rows ---
    if (validatedRows.length > 0) {
      await this.clientsRepository.createMany(validatedRows);
    }

    return {
      total: dataLines.length,
      successful: validatedRows.length,
      failed: errors.length,
      errors,
    };
  }
}
