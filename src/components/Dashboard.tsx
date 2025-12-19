import React, { useState, useEffect, useCallback } from 'react';
import {
    Activity,
    Server,
    Cpu,
    HardDrive,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Clock,
    Globe,
    Database,
    Box,
    Search,
    ChevronDown,
    Copy,
    Check,
    Wifi,
    WifiOff,
    AlertTriangle,
} from 'lucide-react';

interface NodeStats {
    cpu_percent: number;
    memory_percent: number;
    storage_used: number;
    storage_percent: number;
    uptime: number;
}

interface PodInfo {
    pubkey: string;
    ip?: string;
    gossip_port?: number;
}

interface PodsResponse {
    total_count: number;
    pods: PodInfo[];
}

interface PNode {
    id: string;
    ip: string;
    status: 'online' | 'offline' | 'degraded';
    stats: NodeStats | null;
    version: string;
    gossipPort: number;
    pubkey: string | null;
    lastSeen: number | null;
    error?: string;
}

interface RpcResponse<T> {
    jsonrpc: string;
    id: number;
    result?: T;
    error?: {
        code: number;
        message: string;
    };
}

const KNOWN_PNODE_IPS: string[] = [
    // hardcoded for now, need env or something when deploy
    '173.212.220.65',
    '62.171.169.176',
    '161.97.151.101',
    '173.249.11.155',
    '62.171.163.135',
    '173.212.237.139',
    '173.212.255.210',
    '173.212.237.99',
    '173.249.7.61',
    '144.91.109.142',
];

const PRPC_PORT = 4000;
const REQUEST_TIMEOUT = 8000;
const REFRESH_INTERVAL = 30000;

async function rpcCall<T>(
    ip: string,
    method: string,
    params: Record<string, unknown> = {}
): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
        const response = await fetch(`/api/prpc/${ip}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: Date.now(),
                method,
                params,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(
                errorData.error || `HTTP error! status: ${response.status}`
            );
        }

        const data: RpcResponse<T> = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        if (data.result === undefined) {
            throw new Error('No result in response');
        }

        return data.result;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

async function fetchNodeData(ip: string): Promise<PNode> {
    try {
        const [statsResult, podsResult] = await Promise.allSettled([
            rpcCall<NodeStats>(ip, 'getStats'),
            rpcCall<PodsResponse>(ip, 'getPods'),
        ]);

        const stats =
            statsResult.status === 'fulfilled' ? statsResult.value : null;
        const podsData =
            podsResult.status === 'fulfilled' ? podsResult.value : null;

        let status: 'online' | 'offline' | 'degraded' = 'online';
        if (stats) {
            if (stats.cpu_percent > 90 || stats.memory_percent > 95) {
                status = 'degraded';
            }
        }

        return {
            id: ip,
            ip,
            status,
            stats,
            version: 'v0.8 Reinheim',
            gossipPort: 8001,
            pubkey: podsData?.pods?.[0]?.pubkey ?? null,
            lastSeen: Date.now(),
        };
    } catch (error) {
        return {
            id: ip,
            ip,
            status: 'offline',
            stats: null,
            version: 'unknown',
            gossipPort: 8001,
            pubkey: null,
            lastSeen: null,
            error: error instanceof Error ? error.message : 'Connection failed',
        };
    }
}

function formatBytes(bytes: number | undefined | null): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatUptime(seconds: number | undefined | null): string {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function truncateAddress(addr: string | null | undefined): string {
    if (!addr || addr.length < 12) return addr ?? 'N/A';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function useClipboard() {
    const [copied, setCopied] = useState<string | null>(null);

    const copy = useCallback((text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    }, []);

    return { copied, copy };
}

interface StatCardProps {
    icon: React.ElementType;
    label: string;
    value: string | number;
    subValue?: string;
    colorClass: string;
}

function StatCard({
    icon: Icon,
    label,
    value,
    subValue,
    colorClass,
}: StatCardProps) {
    return (
        <div className="flex items-start gap-4 rounded-xl border border-slate-700/50 bg-slate-900/50 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10">
            <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${colorClass}`}
            >
                <Icon size={22} />
            </div>
            <div className="flex flex-col gap-1">
                <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                    {label}
                </span>
                <span className="font-mono text-2xl font-bold">{value}</span>
                {subValue && (
                    <span className="text-xs text-slate-500">{subValue}</span>
                )}
            </div>
        </div>
    );
}

interface NodeCardProps {
    node: PNode;
    onCopy: (text: string, id: string) => void;
    isCopied: boolean;
}

function NodeCard({ node, onCopy, isCopied }: NodeCardProps) {
    const statusConfig = {
        online: {
            color: 'bg-emerald-500',
            textColor: 'text-emerald-400',
            icon: Wifi,
        },
        offline: {
            color: 'bg-red-500',
            textColor: 'text-red-400',
            icon: WifiOff,
        },
        degraded: {
            color: 'bg-amber-500',
            textColor: 'text-amber-400',
            icon: AlertTriangle,
        },
    };

    const config = statusConfig[node.status];
    const StatusIcon = config.icon;

    return (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span
                        className={`h-2.5 w-2.5 rounded-full ${config.color} animate-pulse shadow-lg shadow-current`}
                    />
                    <StatusIcon size={14} className={config.textColor} />
                    <span
                        className={`text-xs font-semibold tracking-wide uppercase ${config.textColor}`}
                    >
                        {node.status}
                    </span>
                </div>
                <span className="rounded bg-slate-800 px-2.5 py-1 font-mono text-xs text-slate-500">
                    {node.version}
                </span>
            </div>

            <div className="mb-4 flex items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-800/50 p-3">
                <Server size={18} className="flex-shrink-0 text-cyan-400" />
                <span className="flex-1 font-mono text-sm">{node.ip}</span>
                <button
                    onClick={() => onCopy(node.ip, node.id)}
                    className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-cyan-400"
                    title="Copy IP"
                >
                    {isCopied ? (
                        <Check size={14} className="text-emerald-400" />
                    ) : (
                        <Copy size={14} />
                    )}
                </button>
            </div>

            {node.pubkey && (
                <div className="mb-4 flex items-center justify-between border-b border-slate-700/50 pb-4">
                    <span className="text-xs tracking-wide text-slate-500 uppercase">
                        Pubkey
                    </span>
                    <span className="font-mono text-xs text-violet-400">
                        {truncateAddress(node.pubkey)}
                    </span>
                </div>
            )}

            {node.stats ? (
                <div className="mb-4 grid grid-cols-3 gap-4">
                    <div className="flex flex-col items-center gap-1.5 text-center">
                        <Cpu size={16} className="text-cyan-400/70" />
                        <span className="font-mono text-sm font-semibold">
                            {node.stats.cpu_percent.toFixed(1)}%
                        </span>
                        <span className="text-[10px] tracking-wide text-slate-500 uppercase">
                            CPU
                        </span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 text-center">
                        <HardDrive size={16} className="text-cyan-400/70" />
                        <span className="font-mono text-sm font-semibold">
                            {formatBytes(node.stats.storage_used)}
                        </span>
                        <span className="text-[10px] tracking-wide text-slate-500 uppercase">
                            Storage
                        </span>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 text-center">
                        <Clock size={16} className="text-cyan-400/70" />
                        <span className="font-mono text-sm font-semibold">
                            {formatUptime(node.stats.uptime)}
                        </span>
                        <span className="text-[10px] tracking-wide text-slate-500 uppercase">
                            Uptime
                        </span>
                    </div>
                </div>
            ) : (
                <div className="mb-4 flex items-center justify-center gap-2 py-4 text-sm text-slate-500">
                    <AlertCircle size={16} />
                    <span>No metrics available</span>
                </div>
            )}

            <div className="flex justify-between border-t border-slate-700/50 pt-4 font-mono text-[11px] text-slate-500">
                <span>Gossip: {node.gossipPort}</span>
                <span>pRPC: {PRPC_PORT}</span>
            </div>
        </div>
    );
}

export default function XandeumDashboard() {
    const [nodes, setNodes] = useState<PNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<
        'all' | 'online' | 'offline' | 'degraded'
    >('all');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const clipboard = useClipboard();

    const fetchData = useCallback(async () => {
        setIsRefreshing(true);

        try {
            const fetchPromises = KNOWN_PNODE_IPS.map((ip) =>
                fetchNodeData(ip)
            );
            const results = await Promise.allSettled(fetchPromises);

            const nodeResults = results.map((result, index) => {
                if (result.status === 'fulfilled') {
                    return result.value;
                }
                return {
                    id: KNOWN_PNODE_IPS[index],
                    ip: KNOWN_PNODE_IPS[index],
                    status: 'offline' as const,
                    stats: null,
                    version: 'unknown',
                    gossipPort: 8001,
                    pubkey: null,
                    lastSeen: null,
                    error: 'Connection failed (CORS)',
                };
            });

            setNodes(nodeResults);
            setLastUpdate(new Date());
        } catch (error) {
            console.error('Error fetching pNode data:', error);
            // Show all nodes as offline on error
            setNodes(
                KNOWN_PNODE_IPS.map((ip) => ({
                    id: ip,
                    ip,
                    status: 'offline' as const,
                    stats: null,
                    version: 'unknown',
                    gossipPort: 8001,
                    pubkey: null,
                    lastSeen: null,
                    error: 'Connection failed',
                }))
            );
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchData]);

    const filteredNodes = nodes.filter((node) => {
        const matchesSearch =
            node.ip.toLowerCase().includes(searchQuery.toLowerCase()) ||
            node.pubkey?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus =
            statusFilter === 'all' || node.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const totalNodes = nodes.length;
    const onlineNodes = nodes.filter((n) => n.status === 'online').length;
    const offlineNodes = nodes.filter((n) => n.status === 'offline').length;
    const nodesWithStats = nodes.filter((n) => n.stats !== null);
    const avgCpu =
        nodesWithStats.length > 0
            ? nodesWithStats.reduce(
                  (acc, n) => acc + (n.stats?.cpu_percent ?? 0),
                  0
              ) / nodesWithStats.length
            : 0;
    const totalStorage = nodes.reduce(
        (acc, n) => acc + (n.stats?.storage_used ?? 0),
        0
    );
    const healthPercent =
        totalNodes > 0 ? ((onlineNodes / totalNodes) * 100).toFixed(0) : '0';
    const showCorsWarning = offlineNodes === totalNodes && totalNodes > 0;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
            <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5" />

            <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl">
                <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-violet-500 shadow-lg shadow-cyan-500/25">
                                <Database size={22} className="text-white" />
                            </div>
                            <div>
                                <h1 className="bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-xl font-bold text-transparent">
                                    Xandeum pNode Analytics
                                </h1>
                                <span className="text-xs text-slate-500">
                                    Devnet Dashboard
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {onlineNodes > 0 && (
                                <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
                                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                                    <span className="text-xs font-medium text-emerald-400">
                                        {onlineNodes} Online
                                    </span>
                                </div>
                            )}

                            {lastUpdate && (
                                <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
                                    <Clock size={14} />
                                    {lastUpdate.toLocaleTimeString()}
                                </span>
                            )}

                            <button
                                onClick={fetchData}
                                disabled={isRefreshing}
                                className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium transition-all hover:border-cyan-500/50 hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <RefreshCw
                                    size={16}
                                    className={
                                        isRefreshing ? 'animate-spin' : ''
                                    }
                                />
                                <span className="hidden sm:inline">
                                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="mb-4 h-12 w-12 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-500" />
                        <p className="text-slate-400">
                            Discovering pNodes in gossip network...
                        </p>
                    </div>
                ) : (
                    <>
                        {showCorsWarning && (
                            <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle
                                        size={20}
                                        className="mt-0.5 flex-shrink-0 text-amber-400"
                                    />
                                    <div>
                                        <h3 className="mb-1 font-semibold text-amber-400">
                                            Connection Limited (CORS)
                                        </h3>
                                        <p className="text-sm text-slate-400">
                                            Browser security blocks direct pNode
                                            connections. To see live data:
                                        </p>
                                        <ul className="mt-2 space-y-1 text-sm text-slate-400">
                                            <li>
                                                Run locally with a CORS proxy
                                            </li>
                                            <li>
                                                Use browser extension to disable
                                                CORS (dev only)
                                            </li>
                                            <li>
                                                Deploy with a backend proxy
                                                server
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Stats Grid */}
                        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
                            <StatCard
                                icon={Server}
                                label="Total pNodes"
                                value={totalNodes}
                                subValue={`${onlineNodes} responding`}
                                colorClass="bg-cyan-500/20 text-cyan-400"
                            />
                            <StatCard
                                icon={CheckCircle2}
                                label="Network Health"
                                value={`${healthPercent}%`}
                                subValue={`${offlineNodes} offline`}
                                colorClass="bg-emerald-500/20 text-emerald-400"
                            />
                            <StatCard
                                icon={Cpu}
                                label="Avg CPU Usage"
                                value={`${avgCpu.toFixed(1)}%`}
                                subValue="Across online nodes"
                                colorClass="bg-amber-500/20 text-amber-400"
                            />
                            <StatCard
                                icon={Globe}
                                label="Total Storage"
                                value={formatBytes(totalStorage)}
                                subValue="Dedicated capacity"
                                colorClass="bg-violet-500/20 text-violet-400"
                            />
                        </div>

                        <div className="mb-6 flex flex-col gap-4 sm:flex-row">
                            <div className="relative flex-1">
                                <Search
                                    size={18}
                                    className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-500"
                                />
                                <input
                                    type="text"
                                    placeholder="Search by IP address or public key..."
                                    value={searchQuery}
                                    onChange={(e) =>
                                        setSearchQuery(e.target.value)
                                    }
                                    className="w-full rounded-lg border border-slate-700/50 bg-slate-900/50 py-3 pr-4 pl-10 text-sm transition-all placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10 focus:outline-none"
                                />
                            </div>
                            <div className="relative">
                                <select
                                    value={statusFilter}
                                    onChange={(e) =>
                                        setStatusFilter(
                                            e.target
                                                .value as typeof statusFilter
                                        )
                                    }
                                    className="w-full cursor-pointer appearance-none rounded-lg border border-slate-700/50 bg-slate-900/50 px-4 py-3 pr-10 text-sm focus:border-cyan-500/50 focus:outline-none sm:w-44"
                                >
                                    <option value="all">All Status</option>
                                    <option value="online">Online</option>
                                    <option value="offline">Offline</option>
                                    <option value="degraded">Degraded</option>
                                </select>
                                <ChevronDown
                                    size={16}
                                    className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-500"
                                />
                            </div>
                        </div>

                        <div className="mb-6 flex items-center gap-3">
                            <Box size={20} className="text-cyan-400" />
                            <h2 className="text-lg font-semibold">
                                pNode Network
                            </h2>
                            <span className="text-sm text-slate-500">
                                Showing {filteredNodes.length} of {totalNodes}
                            </span>
                        </div>

                        {filteredNodes.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                                <Search size={48} className="mb-4 opacity-30" />
                                <p>No pNodes match your search criteria</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {filteredNodes.map((node) => (
                                    <NodeCard
                                        key={node.id}
                                        node={node}
                                        onCopy={clipboard.copy}
                                        isCopied={clipboard.copied === node.id}
                                    />
                                ))}
                            </div>
                        )}

                        <footer className="mt-12 border-t border-slate-800 pt-8">
                            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
                                <a
                                    href="https://xandeum.network"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 transition-colors hover:text-cyan-400"
                                >
                                    <Globe size={14} />
                                    Xandeum Network
                                </a>
                                <a
                                    href="https://docs.xandeum.network"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 transition-colors hover:text-cyan-400"
                                >
                                    <Activity size={14} />
                                    Documentation
                                </a>
                                <a
                                    href="https://discord.gg/uqRSmmM5m"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 transition-colors hover:text-cyan-400"
                                >
                                    <Database size={14} />
                                    Discord
                                </a>
                            </div>
                        </footer>
                    </>
                )}
            </main>
        </div>
    );
}
