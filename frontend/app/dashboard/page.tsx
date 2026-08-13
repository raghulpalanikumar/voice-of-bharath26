'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  User, 
  MessageSquare, 
  HelpCircle, 
  PhoneCall, 
  RefreshCw,
  TrendingUp,
  ShieldAlert,
  Phone,
  Globe,
  Percent,
  Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Escalation {
  id: number;
  user_id: string;
  name: string;
  language_preference: string;
  what_happened: string;
  what_agent_checked: string;
  urgency: 'low' | 'medium' | 'high' | 'emergency';
  follow_up_method: string;
  status: 'open' | 'in_progress' | 'resolved';
  created_at: string;
}

interface CallStats {
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  success_rate: number;
  failure_reasons: Record<string, number>;
}

interface CallRecord {
  id: string;
  user_id: string;
  channel: 'web' | 'sip';
  status: 'success' | 'failed';
  failure_reason: string;
  duration: number;
  created_at: string;
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'analytics' | 'escalations'>('analytics');
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [callStats, setCallStats] = useState<CallStats>({
    total_calls: 0,
    successful_calls: 0,
    failed_calls: 0,
    success_rate: 0,
    failure_reasons: {},
  });
  const [callHistory, setCallHistory] = useState<CallRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<Escalation | null>(null);
  
  // Filters for Escalations
  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  // Filters for Call Analytics
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');

  const fetchEscalations = async (showRefreshIndicator = false) => {
    if (!showRefreshIndicator && loading) setLoading(true);
    
    try {
      const res = await fetch('/api/escalations');
      if (res.ok) {
        const data = await res.json();
        setEscalations(data);
        // If a request is selected, keep its details updated
        if (selectedRequest) {
          const updated = data.find((e: Escalation) => e.id === selectedRequest.id);
          if (updated) setSelectedRequest(updated);
        }
      }
    } catch (err) {
      console.error('Error fetching escalations:', err);
    }
  };

  const fetchCallsData = async () => {
    try {
      const res = await fetch('/api/calls');
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setCallStats(data.stats);
        if (data.history) setCallHistory(data.history);
      }
    } catch (err) {
      console.error('Error fetching calls data:', err);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchEscalations(true), fetchCallsData()]);
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      await Promise.all([fetchEscalations(), fetchCallsData()]);
      setLoading(false);
    };
    initData();

    // Auto-refresh updates every 10 seconds for live statistics
    const interval = setInterval(() => {
      fetchEscalations();
      fetchCallsData();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleStatusChange = async (id: number, newStatus: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch('/api/escalations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (res.ok) {
        await fetchEscalations();
      }
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  // Stats calculation for escalations
  const escTotal = escalations.length;
  const escOpenCount = escalations.filter(e => e.status === 'open').length;
  const escInProgressCount = escalations.filter(e => e.status === 'in_progress').length;
  const escResolvedCount = escalations.filter(e => e.status === 'resolved').length;

  // Filter & Search logic for escalations
  const filteredEscalations = escalations.filter(e => {
    const matchesSearch = 
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.what_happened.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.user_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `BDB-ESC-${e.id}`.toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesUrgency = urgencyFilter === 'all' || e.urgency === urgencyFilter;
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;

    return matchesSearch && matchesUrgency && matchesStatus;
  });

  // Filter logic for call history
  const filteredCallHistory = callHistory.filter(c => {
    const matchesChannel = channelFilter === 'all' || c.channel === channelFilter;
    const matchesOutcome = outcomeFilter === 'all' || c.status === outcomeFilter;
    return matchesChannel && matchesOutcome;
  });

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'emergency':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-red-500/20 text-red-500 border border-red-500/30 flex items-center gap-1 w-fit"><ShieldAlert size={12}/> Emergency</span>;
      case 'high':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-orange-500/20 text-orange-500 border border-orange-500/30 flex items-center gap-1 w-fit"><AlertTriangle size={12}/> High</span>;
      case 'medium':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 flex items-center gap-1 w-fit"><Clock size={12}/> Medium</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/20 text-blue-500 border border-blue-500/30 flex items-center gap-1 w-fit"><HelpCircle size={12}/> Low</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">Open</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">In Progress</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Resolved</span>;
    }
  };

  const maskUserId = (userId: string) => {
    if (!userId) return '';
    if (userId === 'default_user' || userId === 'sip-recipient') return userId;
    
    // Mask SIP phone numbers or web identifiers to protect sensitive data
    const cleanNum = userId.replace(/\D/g, '');
    if (cleanNum.length >= 7) {
      return userId.replace(/^(\+?\d{2,4})?(\d{3,5})(\d{3,4})$/, (match, p1, p2, p3) => {
        const country = p1 || '';
        const masked = '*'.repeat(p2.length);
        return `${country}${masked}${p3}`;
      });
    }
    if (userId.length > 8) {
      return `${userId.slice(0, 3)}****${userId.slice(-3)}`;
    }
    return userId;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const formatFailureReason = (reason: string) => {
    if (!reason) return 'N/A';
    return reason.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 font-sans selection:bg-teal-500/30 selection:text-teal-200 relative overflow-hidden">
      
      {/* Background Gradient Orbs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-teal-500/10 rounded-full blur-[128px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[128px] -z-10 pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/" className="hover:text-teal-400 transition-colors">
              <ArrowLeft className="h-6 w-6 text-slate-400 cursor-pointer" />
            </Link>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">
              BDB Operations Console
            </h1>
          </div>
          <p className="text-slate-400 text-sm">
            Monitor real-time call performance statistics and manage human escalation requests for Bharat Digital Bank.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            onClick={handleRefresh}
            variant="outline"
            className="border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:text-teal-400 text-slate-200"
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link href="/">
            <Button className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-medium shadow-lg shadow-teal-900/20">
              Go to Voice Assistant
            </Button>
          </Link>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-4 mb-8 bg-slate-900/40 p-1 rounded-xl border border-slate-800/80 w-fit">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
            activeTab === 'analytics'
              ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Call Analytics Dashboard
        </button>
        <button
          onClick={() => setActiveTab('escalations')}
          className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
            activeTab === 'escalations'
              ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Escalations Desk ({escOpenCount})
        </button>
      </div>

      {/* TAB 1: CALL ANALYTICS DASHBOARD */}
      {activeTab === 'analytics' && (
        <div className="space-y-8 animate-fadeIn">
          
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
              <div className="text-slate-500 text-xs font-semibold tracking-wider uppercase mb-1.5 flex items-center justify-between">
                <span>Total Calls</span>
                <PhoneCall size={14} className="text-teal-400"/>
              </div>
              <p className="text-3xl font-bold">{callStats.total_calls}</p>
            </div>
            
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
              <div className="text-slate-500 text-xs font-semibold tracking-wider uppercase mb-1.5 flex items-center justify-between">
                <span>Successful Calls</span>
                <CheckCircle2 size={14} className="text-emerald-500"/>
              </div>
              <p className="text-3xl font-bold text-emerald-400">{callStats.successful_calls}</p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
              <div className="text-slate-500 text-xs font-semibold tracking-wider uppercase mb-1.5 flex items-center justify-between">
                <span>Failed Calls</span>
                <AlertTriangle size={14} className="text-red-500"/>
              </div>
              <p className="text-3xl font-bold text-red-400">{callStats.failed_calls}</p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
              <div className="text-slate-500 text-xs font-semibold tracking-wider uppercase mb-1.5 flex items-center justify-between">
                <span>Success Rate</span>
                <Percent size={14} className="text-teal-400"/>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">{callStats.success_rate}%</p>
                <span className="text-[10px] text-emerald-500 flex items-center gap-0.5"><TrendingUp size={10}/> Target &gt;80%</span>
              </div>
            </div>
          </div>

          {/* Call History and Failure analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Call History Pane */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-100">Recent Call Logs</h2>
                <div className="flex gap-2">
                  <select
                    value={channelFilter}
                    onChange={(e) => setChannelFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-900/50 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-teal-500 text-xs cursor-pointer"
                  >
                    <option value="all">All Channels</option>
                    <option value="web">Web Browser</option>
                    <option value="sip">SIP Call</option>
                  </select>
                  <select
                    value={outcomeFilter}
                    onChange={(e) => setOutcomeFilter(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-900/50 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-teal-500 text-xs cursor-pointer"
                  >
                    <option value="all">All Status</option>
                    <option value="success">Success</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-sm">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                    <RefreshCw className="h-8 w-8 animate-spin text-teal-500" />
                    <p className="text-sm">Fetching call records...</p>
                  </div>
                ) : filteredCallHistory.length === 0 ? (
                  <div className="text-center py-20 text-slate-500 text-sm">
                    No calls recorded matching current filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                          <th className="p-4">Time</th>
                          <th className="p-4">Caller ID</th>
                          <th className="p-4">Channel</th>
                          <th className="p-4">Duration</th>
                          <th className="p-4">Outcome</th>
                          <th className="p-4">Detail/Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900">
                        {filteredCallHistory.map((call) => (
                          <tr key={call.id} className="hover:bg-slate-900/20 transition-colors">
                            <td className="p-4 font-light text-slate-400 text-xs whitespace-nowrap">{formatDate(call.created_at)}</td>
                            <td className="p-4 font-mono font-semibold text-slate-300">{maskUserId(call.user_id)}</td>
                            <td className="p-4">
                              {call.channel === 'sip' ? (
                                <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center gap-1 w-fit"><Phone size={10}/> SIP</span>
                              ) : (
                                <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center gap-1 w-fit"><Globe size={10}/> Web</span>
                              )}
                            </td>
                            <td className="p-4 text-slate-300 font-mono text-xs">{formatDuration(call.duration)}</td>
                            <td className="p-4">
                              {call.status === 'success' ? (
                                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Success</span>
                              ) : (
                                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-500/10 text-red-400 border border-red-500/20">Failed</span>
                              )}
                            </td>
                            <td className="p-4 text-xs text-slate-400 max-w-[200px] truncate">
                              {call.status === 'success' ? (
                                <span className="text-emerald-500/80 flex items-center gap-1"><Award size={12}/> Completed successfully</span>
                              ) : (
                                <span className="text-slate-400 flex items-center gap-1"><AlertTriangle size={12} className="text-red-500/50"/> {formatFailureReason(call.failure_reason)}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Failure Analysis Pane */}
            <div className="lg:col-span-1 space-y-4">
              <h2 className="text-lg font-bold text-slate-100">Failure Analysis</h2>
              
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm space-y-6">
                <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-300">Failure Reasons</span>
                  <span className="text-xs text-slate-500">Total Failed: {callStats.failed_calls}</span>
                </div>

                {callStats.failed_calls === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-sm flex flex-col items-center gap-2">
                    <CheckCircle2 className="text-emerald-500 h-8 w-8" />
                    <span>No call failures recorded yet. Great job!</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(callStats.failure_reasons).map(([reason, count]) => {
                      const percentage = callStats.failed_calls > 0 ? Math.round((count / callStats.failed_calls) * 100) : 0;
                      return (
                        <div key={reason} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-300">{formatFailureReason(reason)}</span>
                            <span className="text-slate-500 font-mono">{count} ({percentage}%)</span>
                          </div>
                          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-900">
                            <div 
                              className="bg-gradient-to-r from-red-500 to-orange-500 h-full rounded-full" 
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Info Note on Safeguards */}
                <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-850 space-y-2">
                  <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 text-teal-400">
                    <ShieldAlert size={12} /> Privacy Protection
                  </h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    This dashboard implements Day 8 Caller Protection guidelines. Transcripts, OTPs, CVVs, PINs, bank account numbers, and other sensitive caller parameters are strictly excluded from dashboard databases to maintain user confidentiality.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ESCALATIONS DESK */}
      {activeTab === 'escalations' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
          
          {/* Left/Middle Pane: Request List & Search */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search Input */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search ticket #, name, description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors text-sm"
                />
              </div>

              {/* Urgency Filter */}
              <select
                value={urgencyFilter}
                onChange={(e) => setUrgencyFilter(e.target.value)}
                className="px-3 py-2 bg-slate-900/50 border border-slate-800 rounded-xl text-slate-300 focus:outline-none focus:border-teal-500 text-sm cursor-pointer"
              >
                <option value="all">All Urgency</option>
                <option value="emergency">Emergency</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-900/50 border border-slate-800 rounded-xl text-slate-300 focus:outline-none focus:border-teal-500 text-sm cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            {/* List Wrapper */}
            <div className="bg-slate-900/30 border border-slate-900/80 rounded-2xl overflow-hidden backdrop-blur-sm">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                  <RefreshCw className="h-8 w-8 animate-spin text-teal-500" />
                  <p className="text-sm">Fetching support requests...</p>
                </div>
              ) : filteredEscalations.length === 0 ? (
                <div className="text-center py-20 text-slate-500 text-sm">
                  No escalation requests match the current filters.
                </div>
              ) : (
                <div className="divide-y divide-slate-900">
                  {filteredEscalations.map((request) => (
                    <div
                      key={request.id}
                      onClick={() => setSelectedRequest(request)}
                      className={`p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-900/40 transition-colors ${
                        selectedRequest?.id === request.id ? 'bg-slate-900/60 border-l-2 border-teal-500' : ''
                      }`}
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <span className="text-teal-400 font-mono font-bold text-xs">
                            BDB-ESC-{request.id}
                          </span>
                          {getUrgencyBadge(request.urgency)}
                          {getStatusBadge(request.status)}
                        </div>
                        <h3 className="font-bold text-slate-100 truncate">
                          {request.name} <span className="text-slate-500 text-xs font-normal">({maskUserId(request.user_id)})</span>
                        </h3>
                        <p className="text-slate-400 text-sm line-clamp-1">
                          {request.what_happened}
                        </p>
                        <div className="text-slate-500 text-xs flex items-center gap-4">
                          <span>Language: {request.language_preference}</span>
                          <span>Created: {formatDate(request.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Pane: Selected Request Details */}
          <div className="lg:col-span-1">
            {selectedRequest ? (
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6 sticky top-6 backdrop-blur-sm">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <span className="text-teal-400 font-mono font-bold text-xs">BDB-ESC-{selectedRequest.id}</span>
                    <h2 className="text-lg font-bold text-slate-100">{selectedRequest.name}</h2>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {getUrgencyBadge(selectedRequest.urgency)}
                  </div>
                </div>

                {/* Action: Status Selector */}
                <div className="space-y-2">
                  <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Update Status</label>
                  <div className="flex gap-2">
                    {(['open', 'in_progress', 'resolved'] as const).map((s) => (
                      <button
                        key={s}
                        disabled={updatingId === selectedRequest.id}
                        onClick={() => handleStatusChange(selectedRequest.id, s)}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border capitalize transition-all ${
                          selectedRequest.status === s
                            ? s === 'open'
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-sm'
                              : s === 'in_progress'
                              ? 'bg-blue-500/20 text-blue-400 border-blue-500/40 shadow-sm'
                              : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        {s.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Caller Details Card */}
                <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-850 space-y-3">
                  <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <User size={12} /> Caller Information
                  </h4>
                  <div className="grid grid-cols-2 gap-y-2 text-xs">
                    <span className="text-slate-500">User ID</span>
                    <span className="text-slate-300 font-mono truncate text-right">{maskUserId(selectedRequest.user_id)}</span>
                    <span className="text-slate-500">Language</span>
                    <span className="text-slate-300 text-right">{selectedRequest.language_preference}</span>
                    <span className="text-slate-500">Follow-up Pref</span>
                    <span className="text-slate-300 text-right flex items-center justify-end gap-1">
                      <PhoneCall size={10} /> {selectedRequest.follow_up_method}
                    </span>
                  </div>
                </div>

                {/* What Happened (Summary) */}
                <div className="space-y-2">
                  <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare size={12} /> What Happened
                  </h4>
                  <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-850 text-sm leading-relaxed text-slate-200">
                    {selectedRequest.what_happened}
                  </div>
                </div>

                {/* What the Agent Checked */}
                <div className="space-y-2">
                  <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle size={12} /> Agent Verification Checklist
                  </h4>
                  <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-850 text-sm leading-relaxed text-slate-300 font-light">
                    {selectedRequest.what_agent_checked}
                  </div>
                </div>

                {/* Created Timestamp */}
                <div className="text-center text-slate-500 text-[10px]">
                  Reported at {formatDate(selectedRequest.created_at)}
                </div>

              </div>
            ) : (
              <div className="bg-slate-900/20 border border-dashed border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-sm flex flex-col items-center justify-center min-h-[300px]">
                <HelpCircle className="h-8 w-8 mb-3 text-slate-600" />
                Select a ticket to inspect details, checklist logs, and update status.
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
