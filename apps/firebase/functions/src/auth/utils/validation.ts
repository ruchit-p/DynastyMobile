import {UserDocument} from "../types/user";

/**
 * Validates if a user has the required permissions
 */
export const validateUserPermissions = (user: UserDocument, requiredPermission: "canEdit" | "canAddMembers" | "isAdmin"): boolean => {
  return user[requiredPermission] === true;
};

/**
 * Validates if a user belongs to a specific family tree
 */
export const validateFamilyMembership = (user: UserDocument, familyTreeId: string): boolean => {
  return user.familyTreeId === familyTreeId;
};
