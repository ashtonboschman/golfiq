'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Trash2, CheckCircle, XCircle, Download } from 'lucide-react';
import { AdminPanelSkeleton } from '@/components/skeleton/PageSkeletons';

interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  handicap: string | null;
  signedUpAt: string;
  confirmed: boolean;
}

interface AllowedEmail {
  id: string;
  email: string;
  addedAt: string;
  notes: string | null;
}

export default function AdminWaitlistPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [allowedEmails, setAllowedEmails] = useState<AllowedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  const showMessage = useCallback((msg: string, type: 'success' | 'error') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/waitlist');
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to fetch data');

      setWaitlist(
        data.waitlist.map((w: any) => ({
          id: w.id.toString(),
          email: w.email,
          name: w.name,
          handicap: w.handicap,
          confirmed: w.confirmed,
          signedUpAt: w.createdAt,
        }))
      );

      setAllowedEmails(
        data.allowedEmails.map((a: any) => ({
          id: a.id.toString(),
          email: a.email,
          notes: a.notes,
          addedAt: a.createdAt,
        }))
      );
    } catch (error) {
      console.error('Error fetching data:', error);
      showMessage('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    if (status === 'loading') return;

    const userId = session?.user?.id;
    if (userId !== '1') {
      router.push('/');
      return;
    }

    fetchData();
  }, [status, session?.user?.id, router, fetchData]);

  const addToAllowlist = async (email: string) => {
    try {
      const res = await fetch('/api/admin/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, notes: newNotes }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add to allowlist');

      showMessage(`Added ${email} to allowlist`, 'success');
      setNewEmail('');
      setNewNotes('');
      fetchData();
    } catch (error: any) {
      showMessage(error.message || 'Failed to add to allowlist', 'error');
    }
  };

  const removeFromAllowlist = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from allowlist?`)) return;

    try {
      const res = await fetch(`/api/admin/waitlist?id=${id}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove from allowlist');

      showMessage(`Removed ${email} from allowlist`, 'success');
      fetchData();
    } catch (error: any) {
      showMessage(error.message || 'Failed to remove from allowlist', 'error');
    }
  };

  const exportWaitlist = () => {
    const csv = [
      ['Email', 'Name', 'Handicap', 'Signed Up', 'Confirmed'].join(','),
      ...waitlist.map((entry) =>
        [
          entry.email,
          entry.name || '',
          entry.handicap || '',
          new Date(entry.signedUpAt).toLocaleDateString(),
          entry.confirmed ? 'Yes' : 'No',
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `golfiq-waitlist-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (status === 'loading' || loading) {
    return <AdminPanelSkeleton />;
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <button onClick={exportWaitlist} className="btn btn-secondary">
          <Download/> Export CSV
        </button>
      </div>

      {message && (
        <div className={`message ${messageType === 'error' ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <div className="card">
        <h2 className="card-title">Add Email to Allowlist</h2>
        <div className="form-row">
          <label className="form-label">Email Address</label>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="user@example.com"
            className="form-input"
          />
        </div>
        <div className="form-row">
          <label className="form-label">Notes (Optional)</label>
          <input
            type="text"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            placeholder="Why this user was granted access"
            className="form-input"
          />
        </div>
        <button
          onClick={() => addToAllowlist(newEmail)}
          className="btn btn-primary"
          disabled={!newEmail}
        >
          Add to Allowlist
        </button>
      </div>

      <div className="card">
        <h2 className="card-title">Allowed Emails ({allowedEmails.length})</h2>
        {allowedEmails.length === 0 ? (
          <p className="text-secondary">No emails in allowlist yet.</p>
        ) : (
          <div className="waitlist-table-wrapper">
            <div className="waitlist-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Added</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allowedEmails.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.email}</td>
                      <td>{new Date(entry.addedAt).toLocaleDateString()}</td>
                      <td>{entry.notes || '-'}</td>
                      <td>
                        <button
                          onClick={() => removeFromAllowlist(entry.id, entry.email)}
                          className="btn btn-cancel btn-small"
                        >
                          <Trash2/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="card-title">Waitlist ({waitlist.length})</h2>
        {waitlist.length === 0 ? (
          <p className="text-secondary">No signups yet.</p>
        ) : (
          <div className="waitlist-table-wrapper">
            <div className="waitlist-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Handicap</th>
                    <th>Signed Up</th>
                    <th>Confirmed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlist.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.email}</td>
                      <td>{entry.name || '-'}</td>
                      <td>{entry.handicap || '-'}</td>
                      <td>{new Date(entry.signedUpAt).toLocaleDateString()}</td>
                      <td>
                        {entry.confirmed ? (
                          <CheckCircle className="text-success" />
                        ) : (
                          <XCircle className="text-error" />
                        )}
                      </td>
                      <td>
                        {allowedEmails.some((a) => a.email === entry.email) ? (
                          <button className="btn btn-disabled" disabled>
                            Already Allowed
                          </button>
                        ) : (
                          <button
                            onClick={() => addToAllowlist(entry.email)}
                            className="btn btn-save"
                          >
                            Grant Access
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
