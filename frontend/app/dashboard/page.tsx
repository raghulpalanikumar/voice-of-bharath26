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
  ShieldAlert
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

export default function DashboardPage() {
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<Escalation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchEscalations = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setRefreshing(true);
    else setLoading(true);
    
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
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEscalations();
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

  // Stats calculation
  const total = escalations.length;
  const openCount = escalations.filter(e => e.status === 'open').length;
  const inProgressCount = escalations.filter(e => e.status === 'in_progress').length;
  const resolvedCount = escalations.filter(e => e.status === 'resolved').length;

  // Filter & Search logic
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

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 font-sans selection:bg-teal-500/30 selection:text-teal-200">
      
      {/* Background Gradient Orbs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-teal-500/10 rounded-full blur-[128px] -z-10 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[128px] -z-10 pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/" className="hover:text-teal-400 transition-colors">
              <ArrowLeft className="h-6 w-6 text-slate-400 cursor-pointer" />
            </Link>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">
              BDB Escalations Desk
            </h1>
          </div>
          <p className="text-slate-400 text-sm">
            Review and resolve voice agent escalation requests for Bharat Digital Bank.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            onClick={() => fetchEscalations(true)}
            variant="outline"
            className="border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:text-teal-400"
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

      {/* Key Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
          <div className="text-slate-500 text-xs font-semibold tracking-wider uppercase mb-1.5 flex items-center justify-between">
            <span>Total Requests</span>
            <TrendingUp size={14} className="text-teal-500"/>
          </div>
          <p className="text-2xl font-bold">{total}</p>
        </div>
        
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
          <div className="text-slate-500 text-xs font-semibold tracking-wider uppercase mb-1.5 flex items-center justify-between">
            <span>Open Ticket</span>
            <Clock size={14} className="text-amber-500"/>
          </div>
          <p className="text-2xl font-bold text-amber-500">{openCount}</p>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
          <div className="text-slate-500 text-xs font-semibold tracking-wider uppercase mb-1.5 flex items-center justify-between">
            <span>In Progress</span>
            <Clock size={14} className="text-blue-500"/>
          </div>
          <p className="text-2xl font-bold text-blue-500">{inProgressCount}</p>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
          <div className="text-slate-500 text-xs font-semibold tracking-wider uppercase mb-1.5 flex items-center justify-between">
            <span>Resolved</span>
            <CheckCircle2 size={14} className="text-emerald-500"/>
          </div>
          <p className="text-2xl font-bold text-emerald-500">{resolvedCount}</p>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
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
                        {request.name} <span className="text-slate-500 text-xs font-normal">({request.user_id})</span>
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
                  <span className="text-slate-300 font-mono truncate text-right">{selectedRequest.user_id}</span>
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

    </div>
  );
}
