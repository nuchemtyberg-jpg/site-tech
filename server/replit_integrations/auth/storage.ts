import { users, authorizedUsers, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq, count } from "drizzle-orm";

// Owner emails that are always approved as admin (bypasses invite system)
const OWNER_EMAILS = [
  "nuchemtyberg@gmail.com"
];

// Interface for auth storage operations
// (IMPORTANT) These user operations are mandatory for Replit Auth.
export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  checkAuthorizedEmail(email: string): Promise<{ isAuthorized: boolean; role: string }>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async checkAuthorizedEmail(email: string): Promise<{ isAuthorized: boolean; role: string }> {
    const [authorized] = await db.select().from(authorizedUsers).where(eq(authorizedUsers.email, email.toLowerCase()));
    if (authorized) {
      return { isAuthorized: true, role: authorized.role };
    }
    return { isAuthorized: false, role: "user" };
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const userId = userData.id as string;
    
    // Check if user already exists
    const existingUser = await this.getUser(userId);
    
    // Check if this is an owner email
    const userEmail = userData.email?.toLowerCase() || "";
    const isOwner = userEmail && OWNER_EMAILS.includes(userEmail);
    
    if (existingUser) {
      // User exists - if owner, ensure they're admin/approved
      const updateData: any = {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        profileImageUrl: userData.profileImageUrl,
        updatedAt: new Date(),
      };
      
      // Auto-approve owners
      if (isOwner && (existingUser.role !== "admin" || existingUser.isAuthorized !== "approved")) {
        updateData.role = "admin";
        updateData.isAuthorized = "approved";
      }
      
      const [user] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();
      return user;
    }
    
    // New user - determine role and authorization status
    let role = "user";
    let isAuthorized = "pending";
    
    // Check if this is the first user OR an owner email - make them admin
    const [result] = await db.select({ userCount: count() }).from(users);
    const isFirstUser = !result || Number(result.userCount) === 0;
    
    if (isFirstUser || isOwner) {
      role = "admin";
      isAuthorized = "approved";
    } else if (userData.email) {
      // Check if this email is pre-authorized
      const authCheck = await this.checkAuthorizedEmail(userData.email);
      if (authCheck.isAuthorized) {
        role = authCheck.role;
        isAuthorized = "approved";
      }
    }
    
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        role,
        isAuthorized,
      })
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
