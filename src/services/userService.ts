import { supabase } from '../lib/supabase';
import { addAuditLog } from './auditService';
import type { User, UserRole, AccountStatus } from '../shared/types/user';

const mapProfileToUser = (profile: any): User => {
  const statusMap: Record<string, AccountStatus> = {
    'ACTIVE': 'Active',
    'INACTIVE': 'Inactive',
    'LOCKED': 'Locked',
    'PENDING': 'Pending'
  };

  const deptName = profile.role === 'ADMIN'
    ? 'Central Administration'
    : (profile.department?.name || (profile.department_id ? 'Loading Department...' : 'Department not assigned'));

  return {
    id: profile.id,
    userId: profile.usn_or_employee_id || profile.id.substring(0, 8),
    name: profile.full_name || profile.email.split('@')[0],
    email: profile.email,
    ...(profile.phone ? { phone: profile.phone } : {}),
    role: profile.role,
    departmentId: profile.department_id || profile.department?.id || '',
    departmentName: deptName,
    designation: profile.designation || undefined,
    status: statusMap[profile.account_status] || 'Pending',
    lastActivity: 'Not available',
    createdAt: profile.created_at ? profile.created_at.split('T')[0] : new Date().toISOString().split('T')[0]
  };
};

export const getUsers = async (
  filterRole?: string,
  filterDept?: string,
  filterStatus?: string,
  searchQuery?: string,
  sortBy?: string
): Promise<User[]> => {
  try {
    const { data: dbProfiles, error } = await (supabase as any)
      .from('profiles')
      .select(`
        *,
        department:departments (
          id,
          name,
          code
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to load users: ${error.message}`);
    let result: User[] = (dbProfiles || []).map((p: any) => mapProfileToUser(p));

    if (filterRole && filterRole !== 'All') {
      result = result.filter(u => u.role === filterRole);
    }
    if (filterDept && filterDept !== 'All') {
      result = result.filter(u => u.departmentId === filterDept || u.departmentName.toLowerCase().includes(filterDept.toLowerCase()));
    }
    if (filterStatus && filterStatus !== 'All') {
      result = result.filter(u => u.status === filterStatus);
    }
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(u => 
        u.name.toLowerCase().includes(q) ||
        u.userId.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    }

    if (sortBy) {
      if (sortBy === 'Name') {
        result.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortBy === 'Role') {
        result.sort((a, b) => a.role.localeCompare(b.role));
      } else if (sortBy === 'Department') {
        result.sort((a, b) => a.departmentName.localeCompare(b.departmentName));
      } else if (sortBy === 'Status') {
        result.sort((a, b) => a.status.localeCompare(b.status));
      }
    }

    return result;
  } catch (err) {
    console.error("Error in getUsers:", err);
    throw err;
  }
};

export const getUserById = async (id: string): Promise<User | null> => {
  try {
    const { data: profile, error } = await (supabase as any)
      .from('profiles')
      .select(`
        *,
        department:departments (
          id,
          name,
          code
        )
      `)
      .or(`id.eq.${id},usn_or_employee_id.eq.${id}`)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) throw new Error(`Failed to load user: ${error.message}`);
    return profile ? mapProfileToUser(profile) : null;
  } catch (err) {
    console.error('Error in getUserById:', err);
    throw err;
  }
};

export const createUser = async (data: Omit<User, 'id' | 'createdAt' | 'lastActivity'> & { password?: string }): Promise<User> => {
  if (!data.password) throw new Error('A password is required to provision this account.');

  try {
    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('admin-provision-user', {
      body: {
        fullName: data.name,
        usn_or_employee_id: data.userId,
        email: data.email,
        department_id: data.departmentId,
        password: data.password,
        role: data.role
      }
    });

    if (edgeError) {
      let customErrorMsg = edgeError.message;
      try {
        if (edgeError.context && typeof edgeError.context.json === 'function') {
          const errJson = await edgeError.context.json();
          if (errJson && errJson.error) {
            customErrorMsg = errJson.error;
          }
        }
      } catch {
        // Keep default edgeError.message if json parse fails
      }
      throw new Error(customErrorMsg || 'Provisioning failed via Edge Function.');
    }

    if (edgeData && edgeData.error) {
      throw new Error(edgeData.error);
    }

    if (edgeData && edgeData.user) {
      // Re-fetch user by ID to get full department relation
      const createdUser = await getUserById(edgeData.user.id);
      
      await addAuditLog({
        action: 'USER_CREATED',
        entity_type: 'profile',
        entity_id: edgeData.user.id,
        description: 'User provisioned via the admin Edge Function.',
        metadata: { role: data.role },
      });

      return createdUser || mapProfileToUser(edgeData.user);
    }
  } catch (err: unknown) {
    if (err instanceof Error) throw err;
    throw new Error('User provisioning failed.');
  }

  throw new Error('User provisioning returned no account record.');
};

export const updateUser = async (id: string, updates: Partial<User>): Promise<User | null> => {
  const dbStatusMap: Record<string, string> = {
    'Active': 'ACTIVE',
    'Inactive': 'INACTIVE',
    'Locked': 'LOCKED',
    'Pending': 'PENDING'
  };

  const payload: any = {
    updated_at: new Date().toISOString()
  };

  if (updates.name !== undefined) payload.full_name = updates.name;
  if (updates.departmentId !== undefined) payload.department_id = updates.departmentId || null;
  if (updates.status !== undefined && dbStatusMap[updates.status]) {
    payload.account_status = dbStatusMap[updates.status];
  }
  if (updates.role !== undefined && updates.role !== 'ADMIN') {
    payload.role = updates.role;
  }

  try {
    const { error } = await (supabase as any)
      .from('profiles')
      .update(payload)
      .eq('id', id);

    if (error) {
      console.error('Error updating profile in Supabase:', error);
      throw new Error(error.message);
    }
  } catch (err: any) {
    console.error('Failed to update user profile in Supabase:', err);
    throw err;
  }

  const updatedUser = await getUserById(id);
  return updatedUser;
};

export const deactivateUser = async (id: string): Promise<User | null> => {
  return updateUserStatus(id, 'Inactive', 'ACCOUNT_DEACTIVATED', 'Account deactivated by Administrator');
};

export const reactivateUser = async (id: string): Promise<User | null> => {
  return updateUserStatus(id, 'Active', 'ACCOUNT_REACTIVATED', 'Account reactivated by Administrator');
};

export const lockUser = async (id: string): Promise<User | null> => {
  return updateUserStatus(id, 'Locked', 'ACCOUNT_LOCKED', 'Account administrative lock applied');
};

export const unlockUser = async (id: string): Promise<User | null> => {
  return updateUserStatus(id, 'Active', 'ACCOUNT_UNLOCKED', 'Account administrative lock removed');
};

export const changeUserRole = async (id: string, newRole: UserRole): Promise<User | null> => {
  if (newRole === 'ADMIN') {
    throw new Error("Client cannot elevate user to ADMIN role.");
  }
  return updateUser(id, { role: newRole });
};

export const resetUserPassword = async (id: string): Promise<boolean> => {
  const user = await getUserById(id);
  if (user && user.email) {
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    return !error;
  }
  return false;
};

const updateUserStatus = async (id: string, status: AccountStatus, auditAction: any, metadata: string): Promise<User | null> => {
  const dbStatusMap: Record<string, string> = {
    'Active': 'ACTIVE',
    'Inactive': 'INACTIVE',
    'Locked': 'LOCKED',
    'Pending': 'PENDING'
  };

  const { data, error } = await supabase.functions.invoke('admin-provision-user', {
    body: {
      action: 'update_status',
      targetUserId: id,
      newStatus: dbStatusMap[status] || 'ACTIVE'
    }
  });
  if (error) throw new Error(`Account status update failed: ${error.message}`);
  if (!data?.success) throw new Error(data?.error || 'Account status update failed.');

  await addAuditLog({
    action: auditAction,
    entity_type: 'profile',
    entity_id: id,
    description: metadata,
    metadata: { account_status: dbStatusMap[status] || 'ACTIVE' },
  });

  const updatedUser = await getUserById(id);
  return updatedUser;
};
