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
import { Loader2, UserPlus, Users, Mail, Shield, Check, X, Trash2 } from "lucide-react";
import type { User, AuthorizedUser } from "@shared/models/auth";

export default function UserManagement() {
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
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
    mutationFn: async (data: { email: string; role: string }) => {
      return apiRequest("POST", "/api/admin/authorized-users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/authorized-users"] });
      setNewEmail("");
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

  const handleAddUser = () => {
    if (!newEmail.trim()) return;
    addAuthorizedUserMutation.mutate({ email: newEmail.trim(), role: newRole });
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6" />
            User Management
          </h1>
          <p className="text-muted-foreground">Manage users and control access to the system</p>
        </div>

        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-user">
              <UserPlus className="w-4 h-4 mr-2" />
              Add Authorized User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Authorized User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
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
                <Label htmlFor="role">Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger data-testid="select-role">
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

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Active Users ({users.length})
          </TabsTrigger>
          <TabsTrigger value="authorized" className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Authorized Emails ({authorizedUsers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Registered Users</CardTitle>
              <CardDescription>Users who have logged into the system</CardDescription>
            </CardHeader>
            <CardContent>
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
                          <SelectTrigger className="w-28" data-testid={`select-role-${user.id}`}>
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
                                className="text-green-500 hover:text-green-600 hover:bg-green-500/10"
                                onClick={() => updateUserMutation.mutate({ id: user.id, updates: { isAuthorized: "approved" } })}
                                data-testid={`button-approve-${user.id}`}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                onClick={() => updateUserMutation.mutate({ id: user.id, updates: { isAuthorized: "rejected" } })}
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

        <TabsContent value="authorized" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pre-Authorized Emails</CardTitle>
              <CardDescription>
                Users with these emails will be automatically approved when they register
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Added By</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {authorizedUsers.map((authUser) => (
                    <TableRow key={authUser.id} data-testid={`row-authorized-${authUser.id}`}>
                      <TableCell className="font-medium">{authUser.email}</TableCell>
                      <TableCell>{getRoleBadge(authUser.role)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {authUser.addedByName || "System"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {authUser.createdAt ? new Date(authUser.createdAt).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          onClick={() => deleteAuthorizedUserMutation.mutate(authUser.id)}
                          data-testid={`button-delete-${authUser.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {authorizedUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
    </div>
  );
}
