import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, UserPlus, Users, Mail, Shield, Check, X, Trash2, Pencil } from "lucide-react";
import type { User, AuthorizedUser } from "@shared/models/auth";

export default function UserManagement() {
  const [newEmail, setNewEmail] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AuthorizedUser | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhoneNumber, setEditPhoneNumber] = useState("");
  const [editRole, setEditRole] = useState("user");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: authorizedUsers = [], isLoading: authorizedLoading } = useQuery<AuthorizedUser[]>({
    queryKey: ["/api/admin/authorized-users"],
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { role?: string; isAuthorized?: string } }) => {
      return apiRequest("PUT", `/api/admin/users/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User updated", description: "User settings have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update user.", variant: "destructive" });
    },
  });

  const addAuthorizedUserMutation = useMutation({
    mutationFn: async (data: { email: string; firstName?: string; lastName?: string; phoneNumber?: string; role: string }) => {
      return apiRequest("POST", "/api/admin/authorized-users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/authorized-users"] });
      setNewEmail("");
      setNewFirstName("");
      setNewLastName("");
      setNewPhoneNumber("");
      setNewRole("user");
      setAddDialogOpen(false);
      toast({ title: "User added", description: "Email has been added to the authorized list." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error?.message || "Failed to add authorized user.", 
        variant: "destructive" 
      });
    },
  });

  const deleteAuthorizedUserMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/authorized-users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/authorized-users"] });
      toast({ title: "Removed", description: "Email removed from authorized list." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove authorized user.", variant: "destructive" });
    },
  });

  const updateAuthorizedUserMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { firstName?: string; lastName?: string; phoneNumber?: string; role?: string } }) => {
      return apiRequest("PATCH", `/api/admin/authorized-users/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/authorized-users"] });
      setEditDialogOpen(false);
      setEditingUser(null);
      toast({ title: "Updated", description: "Authorized user has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update authorized user.", variant: "destructive" });
    },
  });

  const handleAddUser = () => {
    if (!newEmail.trim()) return;
    addAuthorizedUserMutation.mutate({ 
      email: newEmail.trim(), 
      firstName: newFirstName.trim() || undefined,
      lastName: newLastName.trim() || undefined,
      phoneNumber: newPhoneNumber.trim() || undefined,
      role: newRole 
    });
  };

  const openEditDialog = (user: AuthorizedUser) => {
    setEditingUser(user);
    setEditFirstName(user.firstName || "");
    setEditLastName(user.lastName || "");
    setEditPhoneNumber(user.phoneNumber || "");
    setEditRole(user.role);
    setEditDialogOpen(true);
  };

  const handleEditUser = () => {
    if (!editingUser) return;
    updateAuthorizedUserMutation.mutate({
      id: editingUser.id,
      updates: {
        firstName: editFirstName.trim() || undefined,
        lastName: editLastName.trim() || undefined,
        phoneNumber: editPhoneNumber.trim() || undefined,
        role: editRole,
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Approved</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Pending</Badge>;
      case "rejected":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">Admin</Badge>;
      case "manager":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Manager</Badge>;
      default:
        return <Badge variant="outline">User</Badge>;
    }
  };

  const getInitials = (user: User) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return "?";
  };

  if (usersLoading || authorizedLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6" />
            User Management
          </h1>
          <p className="text-muted-foreground">Manage users and control access to the system</p>
        </div>

        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="min-h-11" data-testid="button-add-user">
              <UserPlus className="w-4 h-4 mr-2" />
              Add Authorized User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Authorized User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    data-testid="input-last-name"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-red-500">* Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="user@company.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={newPhoneNumber}
                  onChange={(e) => setNewPhoneNumber(e.target.value)}
                  data-testid="input-phone"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger id="role" aria-label="Role" data-testid="select-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button 
                onClick={handleAddUser} 
                disabled={addAuthorizedUserMutation.isPending || !newEmail.trim()}
                data-testid="button-confirm-add"
              >
                {addAuthorizedUserMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="users" className="min-w-0">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:inline-grid sm:w-auto">
          <TabsTrigger value="users" className="min-w-0 whitespace-normal px-2 py-2">
            <Users className="mr-1.5 h-4 w-4 shrink-0" />
            Active Users ({users.length})
          </TabsTrigger>
          <TabsTrigger value="authorized" className="min-w-0 whitespace-normal px-2 py-2">
            <Mail className="mr-1.5 h-4 w-4 shrink-0" />
            Authorized Emails ({authorizedUsers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="min-w-0 mt-4">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Registered Users</CardTitle>
              <CardDescription>Users who have logged into the system</CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            {user.profileImageUrl && <AvatarImage src={user.profileImageUrl} />}
                            <AvatarFallback>{getInitials(user)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">
                            {user.firstName} {user.lastName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(role) => updateUserMutation.mutate({ id: user.id, updates: { role } })}
                        >
                          <SelectTrigger className="w-28" aria-label={`Role for ${user.firstName || user.email || "user"} ${user.lastName || ""}`.trim()} data-testid={`select-role-${user.id}`}>
                            <SelectValue>{getRoleBadge(user.role)}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{getStatusBadge(user.isAuthorized)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {user.isAuthorized === "pending" && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="min-h-11 min-w-11 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                                onClick={() => updateUserMutation.mutate({ id: user.id, updates: { isAuthorized: "approved" } })}
                                aria-label={`Approve ${user.firstName || user.email || "user"}`}
                                data-testid={`button-approve-${user.id}`}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="min-h-11 min-w-11 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                onClick={() => updateUserMutation.mutate({ id: user.id, updates: { isAuthorized: "rejected" } })}
                                aria-label={`Reject ${user.firstName || user.email || "user"}`}
                                data-testid={`button-reject-${user.id}`}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {user.isAuthorized === "rejected" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateUserMutation.mutate({ id: user.id, updates: { isAuthorized: "approved" } })}
                              data-testid={`button-reapprove-${user.id}`}
                            >
                              Approve
                            </Button>
                          )}
                          {user.isAuthorized === "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-500 border-red-500/20 hover:bg-red-500/10"
                              onClick={() => updateUserMutation.mutate({ id: user.id, updates: { isAuthorized: "rejected" } })}
                              data-testid={`button-revoke-${user.id}`}
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No users have registered yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="authorized" className="min-w-0 mt-4">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Pre-Authorized Emails</CardTitle>
              <CardDescription>
                Users with these emails will be automatically approved when they register
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Added By</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {authorizedUsers.map((authUser) => (
                    <TableRow key={authUser.id} data-testid={`row-authorized-${authUser.id}`}>
                      <TableCell className="font-medium">
                        {authUser.firstName || authUser.lastName 
                          ? `${authUser.firstName || ''} ${authUser.lastName || ''}`.trim()
                          : <span className="text-muted-foreground">-</span>
                        }
                      </TableCell>
                      <TableCell>{authUser.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {authUser.phoneNumber || "-"}
                      </TableCell>
                      <TableCell>{getRoleBadge(authUser.role)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {authUser.addedByName || "System"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {authUser.createdAt ? new Date(authUser.createdAt).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="min-h-11 min-w-11"
                            onClick={() => openEditDialog(authUser)}
                            aria-label={`Edit ${authUser.email}`}
                            data-testid={`button-edit-${authUser.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="min-h-11 min-w-11 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            onClick={() => deleteAuthorizedUserMutation.mutate(authUser.id)}
                            aria-label={`Delete ${authUser.email}`}
                            data-testid={`button-delete-${authUser.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {authorizedUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No pre-authorized emails. Add emails to allow specific users to register.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Authorized User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Email</Label>
              <div className="px-3 py-2 bg-muted rounded-md text-sm">
                {editingUser?.email}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editFirstName">First Name</Label>
                <Input
                  id="editFirstName"
                  placeholder="John"
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  data-testid="input-edit-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editLastName">Last Name</Label>
                <Input
                  id="editLastName"
                  placeholder="Doe"
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  data-testid="input-edit-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editPhoneNumber">Phone Number</Label>
              <Input
                id="editPhoneNumber"
                type="tel"
                placeholder="(555) 123-4567"
                value={editPhoneNumber}
                onChange={(e) => setEditPhoneNumber(e.target.value)}
                data-testid="input-edit-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editRole">Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger id="editRole" aria-label="Role" data-testid="select-edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button 
              onClick={handleEditUser} 
              disabled={updateAuthorizedUserMutation.isPending}
              data-testid="button-confirm-edit"
            >
              {updateAuthorizedUserMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
