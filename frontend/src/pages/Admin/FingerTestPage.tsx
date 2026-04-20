import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { lockerService } from '../../services/locker.service';
import { useToast } from '../../hooks/use-toast';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/user.service';
import { LockerEntity } from '../../types/locker.type';

const FingerTestPage: React.FC = () => {
  const [floor, setFloor] = useState<number>(1);
  const [gatewayId, setGatewayId] = useState('gateway-tang1');
  const [deviceId, setDeviceId] = useState('esp32-AS608-LCD-tang1');
  const [userId, setUserId] = useState(''); // will store ObjectId
  const [userEmail, setUserEmail] = useState(''); // shown in input (email)
  const [userSearch, setUserSearch] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<any[]>([]);
  const [lockers, setLockers] = useState<LockerEntity[]>([]);
  const [selectedLockerId, setSelectedLockerId] = useState('');
  const [simulateMode, setSimulateMode] = useState(false);
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
    const normalizedFloor = Number.isInteger(Number(floor)) && Number(floor) > 0 ? Number(floor) : 1;
    setGatewayId(`gateway-tang${normalizedFloor}`);
    setDeviceId(`esp32-AS608-LCD-tang${normalizedFloor}`);
  }, [floor]);

  useEffect(() => {
    let mounted = true;

    const loadLockers = async () => {
      try {
        const data = await lockerService.findAllWithIoT({ isActive: true });
        if (!mounted) return;

        const list = Array.isArray(data) ? data : [];
        setLockers(list);

        if (!selectedLockerId && list.length > 0) {
          const firstId = String(list[0]?.id || list[0]?._id || '').trim();
          if (firstId) {
            setSelectedLockerId(firstId);
          }
        }
      } catch {
        if (mounted) {
          setLockers([]);
        }
      }
    };

    loadLockers();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedLocker = useMemo(() => {
    const normalizedSelectedLockerId = String(selectedLockerId || '').trim();
    if (!normalizedSelectedLockerId) {
      return null;
    }

    return (
      lockers.find((locker) => String(locker?.id || locker?._id || '').trim() === normalizedSelectedLockerId) ||
      null
    );
  }, [lockers, selectedLockerId]);

  useEffect(() => {
    if (!selectedLocker) {
      return;
    }

    const lockerDeviceId = String(selectedLocker.deviceId || '').trim();
    const lockerGatewayId = String(selectedLocker.gatewayId || '').trim();

    if (lockerDeviceId) {
      setDeviceId(lockerDeviceId);

      const floorMatch = lockerDeviceId.match(/tang(\d+)/i);
      if (floorMatch) {
        const parsedFloor = Number(floorMatch[1]);
        if (Number.isFinite(parsedFloor) && parsedFloor > 0) {
          setFloor(Math.round(parsedFloor));
        }
      }
    }

    if (lockerGatewayId) {
      setGatewayId(lockerGatewayId);
    }
  }, [selectedLocker]);

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

  const resolveSelectedUserId = async (): Promise<string | null> => {
    const normalizedCurrentUserId = String(userId || '').trim();
    if (normalizedCurrentUserId) {
      return normalizedCurrentUserId;
    }

    const normalizedEmail = String(userEmail || '').trim();
    if (!normalizedEmail) {
      return null;
    }

    try {
      const matches = await userService.getAll({ search: normalizedEmail });
      const exact = (matches || []).find(
        (m) => String(m?.email || '').trim().toLowerCase() === normalizedEmail.toLowerCase(),
      );

      if (!exact?._id) {
        return null;
      }

      const resolvedId = String(exact._id);
      setUserId(resolvedId);
      if (exact.email) {
        setUserEmail(String(exact.email));
      }
      return resolvedId;
    } catch {
      return null;
    }
  };

  const handleRegister = async () => {
    try {
      setLoading(true);
      const normalizedLockerId = String(selectedLockerId || '').trim();
      if (!normalizedLockerId || !selectedLocker) {
        toast({ title: 'Error', description: 'Please select locker before register', variant: 'destructive' });
        return;
      }

      // require user email
      if (!userEmail) {
        toast({ title: 'Error', description: 'User email is required', variant: 'destructive' });
        return;
      }

      const resolvedUserId = await resolveSelectedUserId();
      if (!resolvedUserId) {
        toast({
          title: 'Error',
          description: 'Cannot resolve userId from email. Please choose a user from the search list.',
          variant: 'destructive',
        });
        return;
      }

      const targetDeviceId = String(selectedLocker.deviceId || deviceId || '').trim();
      const targetGatewayId = String(selectedLocker.gatewayId || gatewayId || '').trim();
      const parsedFloorFromDevice = (() => {
        const matched = targetDeviceId.match(/tang(\d+)/i);
        if (!matched) return floor;
        const n = Number(matched[1]);
        return Number.isFinite(n) && n > 0 ? Math.round(n) : floor;
      })();

      const payload: any = {
        floor: parsedFloorFromDevice,
        gatewayId: targetGatewayId || undefined,
        deviceId: targetDeviceId,
        userId: resolvedUserId,
      };
      // Only include fingerData when explicitly simulating
      if (simulateMode && fingerData) payload.fingerData = fingerData;
      if (delaySeconds !== undefined) payload.delaySeconds = delaySeconds;
      const res = await lockerService.adminTestRegister(payload);
      toast({
        title: 'Sent',
        description: `Register command sent to ${targetDeviceId || 'selected device'}${targetGatewayId ? ` via ${targetGatewayId}` : ''}`,
      });
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
      const normalizedLockerId = String(selectedLockerId || '').trim();
      if (!normalizedLockerId || !selectedLocker) {
        toast({ title: 'Error', description: 'Please select locker to verify', variant: 'destructive' });
        return;
      }

      const res = await lockerService.verifyFingerprint(normalizedLockerId, {
        usageAction: 'unlock',
        delaySeconds,
        metadata: {
          sourceType: 'admin_finger_test_page_verify',
          selectedLockerId: normalizedLockerId,
          selectedLockerNumber: selectedLocker.lockerNumber,
          selectedLockerPin: selectedLocker.controlPin,
        },
      });

      const selectedPin = Number(selectedLocker.controlPin);
      const pinLabel = Number.isFinite(selectedPin) ? `pin ${selectedPin}` : 'locker pin';
      toast({ title: 'Sent', description: `Verify command sent for locker #${selectedLocker.lockerNumber} (${pinLabel})` });
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
              <Label>Locker for register/verify (required)</Label>
              <select
                className="w-full border rounded-md h-10 px-3 bg-background"
                value={selectedLockerId}
                onChange={(e) => setSelectedLockerId(e.target.value)}
              >
                <option value="">Select locker...</option>
                {lockers.map((locker) => {
                  const lockerId = String(locker.id || locker._id || '').trim();
                  if (!lockerId) return null;

                  const pinLabel = Number.isFinite(Number(locker.controlPin))
                    ? `pin ${Number(locker.controlPin)}`
                    : 'no pin';
                  const deviceLabel = locker.deviceId ? String(locker.deviceId) : 'no device';

                  return (
                    <option key={lockerId} value={lockerId}>
                      Locker #{locker.lockerNumber} - {pinLabel} - {deviceLabel}
                    </option>
                  );
                })}
              </select>
              {selectedLocker && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Selected locker #{selectedLocker.lockerNumber} - pin {selectedLocker.controlPin ?? 'N/A'} - device {selectedLocker.deviceId || 'N/A'}
                </p>
              )}
            </div>

            <div>
              <Label>Floor (required)</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={floor}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setFloor(Number.isFinite(next) && next > 0 ? Math.round(next) : 1);
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Device and gateway are auto-derived from floor.
              </p>
            </div>

            <div>
              <Label>Gateway ID (auto)</Label>
              <Input value={gatewayId} readOnly className="bg-muted" />
            </div>

            <div>
              <Label>Device ID AS608-LCD (auto)</Label>
              <Input value={deviceId} readOnly className="bg-muted" />
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

            <p className="text-sm text-muted-foreground">Note: Verify button uses existing locker flow and checks fingerprint for current logged-in user.</p>

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
