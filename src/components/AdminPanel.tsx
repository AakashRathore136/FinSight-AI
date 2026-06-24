import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, getDocs } from 'firebase/firestore';
import { 
  Users, 
  Files, 
  ShieldAlert, 
  Activity,
  UserCheck,
  Search,
  MoreVertical,
  Database
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/src/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/src/components/ui/table';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { formatDateSafe } from '@/src/lib/utils';

export function AdminPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [systemStats, setSystemStats] = useState({
    totalUsers: 0,
    totalDocs: 0,
    analysisCompleted: 0,
    storageUsed: "0 GB"
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Real-time listener for users
    const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const fetchStats = async () => {
      try {
        const allDocs = await getDocs(collection(db, 'documents'));
        const totalDocs = allDocs.size;
        const completed = allDocs.docs.filter(d => d.data().status === 'completed').length;
        const totalSize = allDocs.docs.reduce((acc, d) => acc + (d.data().fileSize || 0), 0);

        setSystemStats({
          totalUsers: users.length,
          totalDocs,
          analysisCompleted: completed,
          storageUsed: (totalSize / 1024 / 1024 / 1024).toFixed(2) + " GB"
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'documents');
      }
      setLoading(false);
    };

    fetchStats();
    return () => unsubscribeUsers();
  }, [users.length]);

  return (
    <div className="space-y-8 pb-12">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-white leading-none">Intelligence Global Control</h1>
        <p className="mt-2 text-slate-500">Global oversight and security management for FinSight AI.</p>
      </section>

      {/* Admin Stats */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <AdminStatCard title="Active Operatives" value={users.length} icon={<Users size={18} />} />
        <AdminStatCard title="Data Inventory" value={systemStats.totalDocs} icon={<Files size={18} />} />
        <AdminStatCard title="Total Extractions" value={systemStats.analysisCompleted} icon={<Activity size={18} />} />
        <AdminStatCard title="Cloud Vault Capacity" value={systemStats.storageUsed} icon={<Database size={18} />} />
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <Card className="lg:col-span-8 bg-slate-900 border-slate-800 rounded-2xl overflow-hidden">
          <CardHeader className="p-8 border-b border-slate-800">
             <CardTitle className="text-xl font-bold text-white tracking-tight">Security Directory</CardTitle>
             <CardDescription className="text-slate-500">Manage organizational access and system-wide permission levels.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
             <Table>
               <TableHeader className="bg-slate-900">
                 <TableRow className="border-slate-800 hover:bg-transparent">
                   <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Identity Profile</TableHead>
                   <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 text-center">Clearance Level</TableHead>
                   <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Registration</TableHead>
                   <TableHead className="w-[80px] px-8 text-right"></TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {users.map((u) => (
                   <TableRow key={u.id} className="border-slate-800/50 hover:bg-slate-800/20 transition-colors group">
                     <TableCell className="px-8 py-5">
                        <div className="flex items-center gap-4">
                           <div className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all overflow-hidden shadow-lg">
                              {u.photoURL ? <img src={u.photoURL} alt="" className="h-full w-full object-cover" /> : String(u.email || '?')[0].toUpperCase()}
                           </div>
                           <div className="min-w-0">
                              <p className="text-sm font-bold text-white truncate leading-tight">{u.displayName || u.email}</p>
                              <p className="text-[10px] text-slate-500 font-mono mt-1 truncate">{u.email}</p>
                           </div>
                        </div>
                     </TableCell>
                     <TableCell className="text-center">
                        <Badge className={`
                          uppercase text-[9px] font-black tracking-widest px-2.5 py-0.5 border-0
                          ${u.role === 'admin' ? 'bg-indigo-600 text-white shadow-[0_0_10px_rgba(79,70,229,0.2)]' : 'bg-slate-800 text-slate-400'}
                        `}>
                           {u.role}
                        </Badge>
                     </TableCell>
                     <TableCell className="text-xs font-semibold text-slate-500 tabular-nums">
                         {formatDateSafe(u.createdAt, { dateStyle: 'medium' })}
                     </TableCell>
                     <TableCell className="px-8 text-right">
                        <Button variant="ghost" size="icon" className="h-10 w-10 text-slate-500 hover:text-white hover:bg-slate-800">
                           <MoreVertical size={18} />
                        </Button>
                     </TableCell>
                   </TableRow>
                 ))}
               </TableBody>
             </Table>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 bg-slate-900 border-slate-800 rounded-2xl shadow-2xl overflow-hidden border-t-2 border-t-indigo-600">
          <CardHeader className="p-8">
            <CardTitle className="text-lg font-bold text-white flex items-center gap-3">
              <ShieldAlert className="text-indigo-400" size={20} />
              System Integrity Logs
            </CardTitle>
            <CardDescription className="text-slate-500">Active threat detections and non-compliance flags across the platform.</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-0 space-y-6">
             <div className="space-y-4">
                <AlertItem 
                   title="Policy Flag" 
                   desc="Unencrypted sensitive key identified in 'Q3_Tax_Return.pdf'" 
                   time="2h ago" 
                   type="danger"
                />
                <AlertItem 
                   title="Volume Anomaly" 
                   desc="High frequency ingest cycle (120+ requests) from single node" 
                   time="6h ago" 
                   type="warning"
                />
                <AlertItem 
                   title="Protocol failure" 
                   desc="Multiple failed authentication attempts on administrative shard" 
                   time="1d ago" 
                />
             </div>
             <Button className="w-full mt-6 bg-slate-800 border border-slate-700 text-white font-bold h-12 rounded-xl shadow-lg hover:bg-slate-700 transition-all">
                Access Audit Logs
             </Button>
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
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-white tabular-nums mt-0.5">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertItem({ title, desc, time, type = "normal" }: any) {
  return (
    <div className={`rounded-xl p-4 space-y-2 border ${
      type === 'danger' ? 'bg-red-500/5 border-red-500/20' : 
      type === 'warning' ? 'bg-amber-500/5 border-amber-500/20' : 
      'bg-slate-800/30 border-slate-700/50'
    }`}>
      <div className="flex items-center justify-between">
         <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded flex items-center gap-2 ${
           type === 'danger' ? 'text-red-500 bg-red-500/10' : 
           type === 'warning' ? 'text-amber-500 bg-amber-500/10' : 
           'text-indigo-400 bg-indigo-500/10'
         }`}>
           <div className={`w-1 h-1 rounded-full ${
             type === 'danger' ? 'bg-red-500 animate-pulse' : 
             type === 'warning' ? 'bg-amber-500' : 
             'bg-indigo-500'
           }`} />
           {title}
         </span>
         <span className="text-[10px] font-bold text-slate-500">{time}</span>
      </div>
      <p className="text-xs text-slate-300 font-medium leading-relaxed">{desc}</p>
    </div>
  );
}
