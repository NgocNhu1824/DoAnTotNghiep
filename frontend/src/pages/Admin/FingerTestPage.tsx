import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { lockerService } from '../../services/locker.service';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/user.service';

const FingerTestPage: React.FC = () => {
  const [deviceId, setDeviceId] = useState('esp32-1');
  const [userId, setUserId] = useState(''); // will store ObjectId
  const [userEmail, setUserEmail] = useState(''); // shown in input (email)
  const [userSearch, setUserSearch] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [simulateMode, setSimulateMode] = useState(false);
  const [confirmActAsOther, setConfirmActAsOther] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fingerData, setFingerData] = useState('');
  const [delaySeconds, setDelaySeconds] = useState<number | undefined>(3);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user, roleDetails, hasPermission } = useAuth();

  useEffect(() => {
    if (user && user._id) {
      setUserId(user._id);
      setUserEmail(user.email || '');
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;
    const doSearch = async () => {
      if (!userSearch || userSearch.length < 2) {
        setUserSearchResults([]);
        return;
      }
      try {
        const results = await userService.getAll({ search: userSearch });
        if (mounted) setUserSearchResults(results || []);
      } catch (e) {
        // ignore
      }
    };

    const t = setTimeout(doSearch, 300);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [userSearch]);

  const handleRegister = async () => {
    try {
      setLoading(true);
      // require user email
      if (!userEmail) {
        toast({ title: 'Error', description: 'User email is required', variant: 'destructive' });
        return;
      }

      // try resolve userId by exact email if not selected
      if (!userId && userEmail) {
        try {
          const matches = await userService.getAll({ search: userEmail });
          const exact = (matches || []).find((m) => m.email === userEmail);
          if (exact) setUserId(exact._id);
        } catch (e) {
          // ignore resolution errors, we'll send email if unresolved
        }
      }

      const payload: any = { deviceId };
      if (userId) payload.userId = userId;
      else payload.userEmail = userEmail;
      // Only include fingerData when explicitly simulating
      if (simulateMode && fingerData) payload.fingerData = fingerData;
      if (delaySeconds !== undefined) payload.delaySeconds = delaySeconds;
      const res = await lockerService.adminTestRegister(payload);
      toast({ title: 'Sent', description: 'Register command sent to gateway' });
      console.log('register result', res);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to send register' , variant: 'destructive'});
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    try {
      setLoading(true);
      if (!userEmail) {
        toast({ title: 'Error', description: 'User email is required', variant: 'destructive' });
        return;
      }

      if (!userId && userEmail) {
        try {
          const matches = await userService.getAll({ search: userEmail });
          const exact = (matches || []).find((m) => m.email === userEmail);
          if (exact) setUserId(exact._id);
        } catch (e) {
          // ignore
        }
      }

      const payload: any = { deviceId };
      if (userId) payload.userId = userId;
      else payload.userEmail = userEmail;
      const res = await lockerService.adminTestVerify(payload);
      toast({ title: 'Sent', description: 'Verify command sent to gateway' });
      console.log('verify result', res);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to send verify', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Fingerprint Test Page (admin-only, no menu)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 max-w-xl">
            <div>
              <Label>Device ID</Label>
              <Input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} />
            </div>

            <div>
              <Label>User email — required</Label>
              <Input
                value={userEmail || userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setUserEmail(e.target.value);
                  // clear selected id when user types
                  setUserId('');
                }}
                placeholder={user ? `${user.email}` : 'Enter user email'}
              />
              {userSearchResults.length > 0 && (
                <div className="border rounded mt-1 max-h-40 overflow-auto bg-white">
                  {userSearchResults.map((u) => (
                    <div
                      key={u._id}
                      className="p-2 hover:bg-gray-100 cursor-pointer"
                      onClick={() => {
                        setUserId(u._id);
                        setUserEmail(u.email || u._id);
                        setUserSearchResults([]);
                      }}
                    >
                      <div className="font-medium">{u.email}</div>
                      <div className="text-xs text-gray-500">{u._id}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            

            <div>
              <Label>Device LCD timeout (seconds, optional)</Label>
              <Input value={delaySeconds ?? ''} onChange={(e) => setDelaySeconds(e.target.value ? Number(e.target.value) : undefined)} />
            </div>

            <div className="flex gap-3">
              <Button onClick={handleRegister} disabled={loading}>Register Finger</Button>
              <Button variant="secondary" onClick={handleVerify} disabled={loading}>Verify Finger</Button>
            </div>

            <p className="text-sm text-muted-foreground">Note: This page is for testing only. Use direct URL to access.</p>

            {(roleDetails?.roleCode === 'DEV_TOOLS' || roleDetails?.roleCode === 'ADMIN' || hasPermission('DEV_TOOLS')) && (
              <>
                <div className="mt-4">
                  <button
                    className="text-sm text-blue-600 hover:underline"
                    onClick={() => setShowAdvanced((s) => !s)}
                  >
                    {showAdvanced ? 'Hide advanced' : 'Show advanced (dev only)'}
                  </button>
                </div>

                {showAdvanced && (
              <div className="mt-3 p-3 border rounded bg-gray-50">
                <div className="flex items-center gap-2">
                  <input
                    id="simulateMode"
                    type="checkbox"
                    checked={simulateMode}
                    onChange={(e) => setSimulateMode(e.target.checked)}
                    disabled={!hasPermission || !hasPermission('DEV_TOOLS')}
                  />
                  <Label htmlFor="simulateMode">Simulate mode (dev-only)</Label>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Dev only — sends a fake fingerprint template to server. Do not use in production.
                  {!hasPermission || !hasPermission('DEV_TOOLS') ? (
                    <span className="block text-xs text-red-600">You need DEV_TOOLS permission to enable simulate.</span>
                  ) : null}
                </p>

                {simulateMode && (
                  <div className="mt-3">
                    <Label>Simulate Finger Data (string or number)</Label>
                    <Input value={fingerData} onChange={(e) => setFingerData(e.target.value)} />
                  </div>
                )}
              </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FingerTestPage;
