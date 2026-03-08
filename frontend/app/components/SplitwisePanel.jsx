'use client'

import { useEffect, useState } from 'react';
import {
  fetchSplitwiseGroups,
  fetchSplitwiseGroupSummary,
  fetchSplitwiseGroup,
  fetchSplitwiseMe,
  getSplitwiseAuthorizeUrl,
  createSplitwiseExpense
} from '../../lib/api';

const GROUPS_EMPTY = [];

const normalizeMembers = (group) => {
  if (!group) return [];
  if (Array.isArray(group.members)) {
    return group.members.map((m) => {
      if (m.user) return { id: m.user.id, name: m.user.name || `${m.user.first_name || ''} ${m.user.last_name || ''}`.trim() };
      return { id: m.id, name: m.name || `${m.first_name || ''} ${m.last_name || ''}`.trim() };
    });
  }
  if (Array.isArray(group.memberships)) {
    return group.memberships.map((m) => ({ id: m.user_id || m.user?.id, name: m.user?.name || m.user?.email || 'Member' }));
  }
  return [];
};

export function SplitwisePanel() {
  const [groups, setGroups] = useState(GROUPS_EMPTY);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [summary, setSummary] = useState(null);
  const [groupInfo, setGroupInfo] = useState(null);
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);

  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [payerId, setPayerId] = useState('');
  const [submitStatus, setSubmitStatus] = useState('idle');

  useEffect(() => {
    const loadGroups = async () => {
      const token = localStorage.getItem('sb-token');
      if (!token) return;
      setError('');
      try {
        const res = await fetchSplitwiseGroups(token);
        const list = res.groups || [];
        setGroups(list);
        setConnected(true);
        if (list.length > 0) {
          setSelectedGroup(String(list[0].id));
        }
      } catch (err) {
        setConnected(false);
        setError(err.message || 'Failed to load Splitwise groups');
      }
    };

    loadGroups();
  }, []);

  useEffect(() => {
    const loadSummary = async () => {
      if (selectedGroup === '') return;
      const token = localStorage.getItem('sb-token');
      if (!token) return;
      setStatus('loading');
      setError('');
      try {
        const res = await fetchSplitwiseGroupSummary(token, selectedGroup);
        setSummary(res.summary || null);
        setStatus('idle');
      } catch (err) {
        setStatus('idle');
        setError(err.message || 'Failed to load summary');
      }
    };

    loadSummary();
  }, [selectedGroup]);

  useEffect(() => {
    const loadGroupInfo = async () => {
      if (selectedGroup === '') return;
      const token = localStorage.getItem('sb-token');
      if (!token) return;
      try {
        if (String(selectedGroup) === '0') {
          const meRes = await fetchSplitwiseMe(token);
          const me = meRes.user || null;
          if (me?.id) {
            const meObj = { id: me.id, name: me.name || me.email || 'Me' };
            setMembers([meObj]);
            setPayerId(String(me.id));
          }
          setGroupInfo(null);
          return;
        }

        const res = await fetchSplitwiseGroup(token, selectedGroup);
        const group = res.group || null;
        setGroupInfo(group);
        const m = normalizeMembers(group);
        setMembers(m);
        if (m.length > 0) {
          setPayerId(String(m[0].id));
          return;
        }
        const meRes = await fetchSplitwiseMe(token);
        const me = meRes.user || null;
        if (me?.id) {
          setMembers([{ id: me.id, name: me.name || me.email || 'Me' }]);
          setPayerId(String(me.id));
        }
      } catch (err) {
        setError(err.message || 'Failed to load group info');
      }
    };

    loadGroupInfo();
  }, [selectedGroup]);

  const formatCurrency = (value) => {
    const num = Number(value || 0);
    return `INR ${num.toFixed(2)}`;
  };

  const connectSplitwise = async () => {
    const token = localStorage.getItem('sb-token');
    if (!token) return;
    try {
      const redirectUri = `${window.location.origin}/splitwise/callback`;
      const res = await getSplitwiseAuthorizeUrl(token, redirectUri);
      if (res.authorize_url) {
        window.location.href = res.authorize_url;
      }
    } catch (err) {
      setError(err.message || 'Failed to start Splitwise connection');
    }
  };

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('sb-token');
    if (!token) return;
    if (!payerId) return;

    const amount = Number(cost);
    if (!description || !amount || amount <= 0) {
      setError('Provide a description and valid amount.');
      return;
    }

    if (members.length === 0) {
      setError('No group members available.');
      return;
    }

    const baseShare = Number((amount / members.length).toFixed(2));
    const split = {};
    members.forEach((m) => {
      split[m.id] = baseShare;
    });
    const totalShares = baseShare * members.length;
    const remainder = Number((amount - totalShares).toFixed(2));
    if (remainder !== 0 && members[0]) {
      split[members[0].id] = Number((split[members[0].id] + remainder).toFixed(2));
    }

    const paid_by = { [payerId]: amount };

    setSubmitStatus('saving');
    setError('');
    try {
      await createSplitwiseExpense(token, {
        description,
        cost: amount,
        group_id: Number(selectedGroup),
        paid_by,
        split
      });
      setDescription('');
      setCost('');
      setSubmitStatus('idle');
      const res = await fetchSplitwiseGroupSummary(token, selectedGroup);
      setSummary(res.summary || null);
    } catch (err) {
      setSubmitStatus('idle');
      setError(err.message || 'Failed to create expense');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2 bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Splitwise Groups</h2>
            <p className="text-sm text-slate-600">Select a group to view shared expense analytics.</p>
          </div>
          {connected ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="text-sm rounded-2xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
              >
                {groups.length === 0 && <option value="">No groups</option>}
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => window.open('https://secure.splitwise.com/#/groups/new', '_blank')}
                className="px-3 py-2 rounded-2xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50"
              >
                Create Group
              </button>
            </div>
          ) : (
            <button
              onClick={connectSplitwise}
              className="px-3 py-2 rounded-2xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
            >
              Connect Splitwise
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-100 p-3 rounded-2xl text-sm text-rose-700">
            {error}
          </div>
        )}

        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total</p>
              <p className="text-xl font-semibold text-slate-900">{formatCurrency(summary.total_cost)}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Net Balances</p>
              <div className="mt-2 space-y-2">
                {summary.net_balances && Object.entries(summary.net_balances).map(([name, amount]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{name}</span>
                    <span className={amount >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                      {formatCurrency(amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Paid By</p>
              <div className="mt-2 space-y-2">
                {summary.paid_by && Object.entries(summary.paid_by).map(([name, amount]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{name}</span>
                    <span className="text-slate-900">{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Owed By</p>
              <div className="mt-2 space-y-2">
                {summary.owed_by && Object.entries(summary.owed_by).map(([name, amount]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{name}</span>
                    <span className="text-slate-900">{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {status === 'loading' && (
          <div className="text-sm text-slate-500">Loading summary...</div>
        )}
      </section>

      <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <h3 className="text-lg font-semibold text-slate-900">Add Expense</h3>
        <p className="text-sm text-slate-600 mt-1">Create a Splitwise expense in this group.</p>
        {String(selectedGroup) !== '0' && members.length <= 1 && (
          <p className="mt-2 text-xs text-amber-700">
            Only one member found in this group. Invite others in Splitwise to split expenses.
          </p>
        )}
        <form onSubmit={handleCreateExpense} className="mt-4 space-y-3">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="Amount"
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <select
            value={payerId}
            onChange={(e) => setPayerId(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {members.length === 0 && <option value="">No members</option>}
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={submitStatus === 'saving' || members.length === 0}
            className="w-full rounded-2xl bg-slate-900 text-white py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {submitStatus === 'saving' ? 'Saving...' : 'Create Expense (Split equally)'}
          </button>
        </form>
      </section>

      <section className="bg-white/85 backdrop-blur border border-white/70 rounded-3xl shadow-xl shadow-slate-200/60 p-6">
        <h3 className="text-lg font-semibold text-slate-900">Groups</h3>
        <p className="text-sm text-slate-600 mt-1">Available Splitwise groups.</p>
        <div className="mt-4 space-y-3">
          {groups.length === 0 && (
            <div className="text-sm text-slate-500">No groups found.</div>
          )}
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedGroup(String(g.id))}
              className={`w-full text-left rounded-2xl border px-4 py-3 text-sm transition ${
                String(g.id) === String(selectedGroup)
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      </section>

      <section className="lg:col-span-3 bg-white/70 backdrop-blur border border-white/70 rounded-3xl shadow-sm p-5">
        <h4 className="text-sm font-semibold text-slate-900">How to use Splitwise here</h4>
        <div className="mt-2 text-sm text-slate-600">
          1. Connect your Splitwise account.
          <br />
          2. Pick a group to view analytics.
          <br />
          3. Use the form to add an expense (split equally).
        </div>
      </section>
    </div>
  );
}
