/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, react-hooks/immutability, react-hooks/purity, react-hooks/refs, react-hooks/set-state-in-effect */
import { useState, useEffect } from "react";
import { db, handleFirestoreError, OperationType } from "@/src/lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import {
  Users,
  Files,
  Activity,
  MoreVertical,
  Database,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/src/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { formatDateSafe } from "@/src/lib/utils";

export function AdminPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [systemStats, setSystemStats] = useState({
    totalUsers: 0,
    totalDocs: 0,
    analysisCompleted: 0,
    storageUsed: "0 GB",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Real-time listener for users (subscribed once)
    const usersQuery = query(
      collection(db, "users"),
      orderBy("createdAt", "desc"),
    );
    const unsubscribeUsers = onSnapshot(
      usersQuery,
      (snapshot) => {
        const nextUsers = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setUsers(nextUsers);
        setSystemStats((prev) => ({ ...prev, totalUsers: nextUsers.length }));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, "users");
      },
    );
    return () => unsubscribeUsers();
  }, []);

  useEffect(() => {
    // Documents stats are fetched once; totalUsers is derived from the live
    // users snapshot, not from a stale closure.
    const fetchStats = async () => {
      try {
        const allDocs = await getDocs(collection(db, "documents"));
        const totalDocs = allDocs.size;
        const completed = allDocs.docs.filter(
          (d) => d.data().status === "completed",
        ).length;
        const totalSize = allDocs.docs.reduce(
          (acc, d) => acc + (d.data().fileSize || 0),
          0,
        );

        setSystemStats((prev) => ({
          ...prev,
          totalDocs,
          analysisCompleted: completed,
          storageUsed: (totalSize / 1024 / 1024 / 1024).toFixed(2) + " GB",
        }));
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, "documents");
      }
      setLoading(false);
    };

    fetchStats();
  }, []);

  return (
    <div className="space-y-8 pb-12">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-white leading-none">
          Intelligence Global Control
        </h1>
        <p className="mt-2 text-slate-500">
          Global oversight and security management for FinSight AI.
        </p>
      </section>

      {/* Admin Stats */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard
          title="Active Operatives"
          value={users.length}
          icon={<Users size={18} />}
        />
        <AdminStatCard
          title="Data Inventory"
          value={systemStats.totalDocs}
          icon={<Files size={18} />}
        />
        <AdminStatCard
          title="Total Extractions"
          value={systemStats.analysisCompleted}
          icon={<Activity size={18} />}
        />
        <AdminStatCard
          title="Cloud Vault Capacity"
          value={systemStats.storageUsed}
          icon={<Database size={18} />}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <Card className="lg:col-span-12 bg-slate-900 border-slate-800 rounded-2xl overflow-hidden">
          <CardHeader className="p-8 border-b border-slate-800">
            <CardTitle className="text-xl font-bold text-white tracking-tight">
              Security Directory
            </CardTitle>
            <CardDescription className="text-slate-500">
              Manage organizational access and system-wide permission levels.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-900">
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Identity Profile
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-center">
                    Clearance Level
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Registration
                  </TableHead>
                  <TableHead className="w-[80px] px-8 text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow
                    key={u.id}
                    className="border-slate-800/50 hover:bg-slate-800/20 transition-colors group"
                  >
                    <TableCell className="px-8 py-5">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all overflow-hidden shadow-lg">
                          {u.photoURL ? (
                            <img
                              src={u.photoURL}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            String(u.email || "?")[0].toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate leading-tight">
                            {u.displayName || u.email}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono mt-1 truncate">
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        className={`
                          uppercase text-[9px] font-black tracking-widest px-2.5 py-0.5 border-0
                          ${u.role === "admin" ? "bg-indigo-600 text-white shadow-[0_0_10px_rgba(79,70,229,0.2)]" : "bg-slate-800 text-slate-400"}
                        `}
                      >
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-slate-500 tabular-nums">
                      {formatDateSafe(u.createdAt, { dateStyle: "medium" })}
                    </TableCell>
                    <TableCell className="px-8 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-slate-500 hover:text-white hover:bg-slate-800"
                      >
                        <MoreVertical size={18} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AdminStatCard({ title, value, icon }: any) {
  return (
    <Card className="bg-slate-900 border-slate-800 rounded-2xl p-6 shadow-xl">
      <CardContent className="p-0 flex items-center gap-5">
        <div className="h-12 w-12 rounded-xl bg-indigo-600/10 text-indigo-400 flex items-center justify-center shadow-inner">
          {icon}
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            {title}
          </p>
          <p className="text-2xl font-bold text-white tabular-nums mt-0.5">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
