import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, ErrorText, Field, Screen } from '@/components/ui';
import { RideColors, Spacing } from '@/constants/theme';
import { centsToInput, parseAmount, parseDollars, vehicleTitle } from '@/core/garage';
import {
  DISH_MODELS, POWER_SOURCES, budgetSummary, formatHours, formatWh, powerBudget, typicalWatts, type DishModel, type PowerSource,
} from '@/core/power';
import { getStarlinkSetup, myVehicles, saveStarlinkSetup, type VehicleWithCost } from '@/lib/api';
import { useSession } from '@/lib/session';
import {
  compassPoint, DISH_HOST, DishError, dishHeadline, dishReadSupported, formatMbps, formatPercent, formatSeconds, formatUptime,
  readHistory, readStatus, type DishHistory, type DishStatus,
} from '@/lib/starlink';
import { useTheme } from '@/hooks/use-theme';

const numText = (n: number | null | undefined) => (n == null ? '' : String(n));

export default function StarlinkPage() {
  const { session, loading } = useSession();
  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        See how your dish is doing, keep your plan details handy, and work out how long your batteries will run it.
      </ThemedText>
      <DishStatusCard />
      {loading ? null : <SetupForm signedIn={!!session} />}
    </Screen>
  );
}

// --- Live dish status -----------------------------------------------------------

const STATUS_EVERY_MS = 3_000;
const HISTORY_EVERY_MS = 60_000;
const RETRY_EVERY_MS = 10_000;
// Set once the rider has tapped Connect, so the page reconnects by itself next time. Waiting
// for that first tap keeps iOS's local network prompt tied to something the rider chose.
const AUTO_KEY = 'starlink.autoConnect.v1';

/**
 * Keeps reading the dish while this page is open and the app is in front: status every few
 * seconds, the 15-minute history every minute. Stops when the rider leaves the page.
 */
function useLiveDish() {
  const [status, setStatus] = useState<DishStatus | null>(null);
  const [history, setHistory] = useState<DishHistory | null>(null);
  const [readAt, setReadAt] = useState<number | null>(null);
  const [failure, setFailure] = useState<DishError | null>(null);
  const [wanted, setWanted] = useState(false);
  const [focused, setFocused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const historyAt = useRef(0);
  const [nudge, setNudge] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(AUTO_KEY).then((v) => v === '1' && setWanted(true)).catch(() => {});
    const sub = AppState.addEventListener('change', (st) => setAppActive(st === 'active'));
    return () => sub.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const running = dishReadSupported && wanted && focused && appActive;
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let next = STATUS_EVERY_MS;
      try {
        const s = await readStatus();
        if (stopped) return;
        setStatus(s);
        setReadAt(Date.now());
        setFailure(null);
        if (Date.now() - historyAt.current >= HISTORY_EVERY_MS) {
          historyAt.current = Date.now();
          readHistory().then((h) => !stopped && h && setHistory(h));
        }
      } catch (e) {
        if (stopped) return;
        setFailure(e instanceof DishError ? e : new DishError('unreachable', e instanceof Error ? e.message : String(e)));
        next = RETRY_EVERY_MS;
      }
      if (!stopped) timer = setTimeout(tick, next);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [running, nudge]);

  const connect = useCallback(() => {
    AsyncStorage.setItem(AUTO_KEY, '1').catch(() => {});
    historyAt.current = 0;
    setFailure(null);
    setWanted(true);
    setNudge((n) => n + 1);
  }, []);

  return { status, history, readAt, failure, connecting: running && !status && !failure, live: running && !failure && !!status, connect };
}

function DishStatusCard() {
  const theme = useTheme();
  const { status: s, history: h, readAt, failure, connecting, live, connect } = useLiveDish();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!dishReadSupported) {
    return (
      <Card>
        <ThemedText type="smallBold">Your dish</ThemedText>
        <ThemedText>
          Reading your dish only works in the OnMyLead phone app. Your dish talks to devices on its own Wi-Fi at {DISH_HOST},
          and web browsers block a secure web page from reaching it.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">You can still save your plan and use the power calculator below.</ThemedText>
      </Card>
    );
  }

  const ageS = readAt ? Math.max(0, Math.round((now - readAt) / 1000)) : null;
  const facing = s ? compassPoint(s.azimuthDeg) : null;
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <ThemedText type="smallBold">Your dish</ThemedText>
        {live ? (
          <ThemedText type="small" style={{ color: RideColors.green, fontWeight: '700' }}>● LIVE</ThemedText>
        ) : s && ageS != null ? (
          <ThemedText type="small" themeColor="textSecondary">Last read {formatSeconds(ageS)} ago</ThemedText>
        ) : null}
      </View>
      {!s && !failure && !connecting ? (
        <ThemedText type="small" themeColor="textSecondary">
          Join your Starlink Wi-Fi, then tap Connect. This page then stays live while it is open.
        </ThemedText>
      ) : null}

      {failure ? (
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="subtitle">Can’t reach your dish</ThemedText>
          <ThemedText>
            {failure.kind === 'refused' || failure.kind === 'unreadable'
              ? 'Your dish answered but we could not read it. A Starlink software update may have changed things. Try again later.'
              : 'Join your Starlink Wi-Fi and allow OnMyLead to use your local network (Settings › OnMyLead). We keep trying every 10 seconds.'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{failure.message}</ThemedText>
        </View>
      ) : null}

      {s ? (
        <View style={{ gap: Spacing.two }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: s.online ? RideColors.green : RideColors.red }} />
            <ThemedText type="subtitle">{s.state}</ThemedText>
          </View>
          <ThemedText>{dishHeadline(s)}</ThemedText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three }}>
            <Stat label="Download now" value={formatMbps(s.downlinkBps)} />
            <Stat label="Upload now" value={formatMbps(s.uplinkBps)} />
            <Stat label="Latency" value={s.latencyMs == null ? '—' : `${Math.round(s.latencyMs)} ms`} />
            <Stat label="Sky blocked" value={formatPercent(s.obstructionFraction)} />
            <Stat label="Dropped pings" value={formatPercent(s.dropRate)} />
            <Stat label="Up for" value={formatUptime(s.uptimeS)} />
          </View>
          {s.alerts.length ? (
            <View style={{ gap: Spacing.one }}>
              <ThemedText type="smallBold">Alerts</ThemedText>
              {s.alerts.map((a) => <ThemedText key={a.code}>• {a.text}</ThemedText>)}
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">No alerts.</ThemedText>
          )}
          {h && h.samples > 0 ? <HistoryView h={h} /> : null}
          <ThemedText type="small" themeColor="textSecondary">
            {[
              facing && s.elevationDeg != null ? `Facing ${facing}, ${Math.round(s.elevationDeg)}° up` : null,
              s.gpsSats != null ? `GPS ${s.gpsValid ? 'locked' : 'searching'}, ${s.gpsSats} sats` : null,
              s.ethSpeedMbps ? `Ethernet ${s.ethSpeedMbps} Mbps` : null,
              s.softwareVersion ? `Software ${s.softwareVersion}` : null,
              s.hardwareVersion ? `Hardware ${s.hardwareVersion}` : null,
            ].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
      ) : null}

      {!live ? (
        <Button
          title={connecting ? 'Connecting…' : failure ? 'Retry now' : 'Connect to my dish'}
          big
          disabled={connecting}
          onPress={connect}
        />
      ) : null}
      {connecting && !s ? <ActivityIndicator color={theme.accent} /> : null}
      <ThemedText type="small" themeColor="textSecondary">
        This uses your dish’s built-in local connection, which SpaceX doesn’t officially support. A Starlink update can break it;
        everything else on this page keeps working.
      </ThemedText>
    </Card>
  );
}

/** The last 15 minutes: one bar per minute for download speed, red where the connection dropped. */
function HistoryView({ h }: { h: DishHistory }) {
  const peak = Math.max(1, ...h.timeline.map((m) => m.avgDownlinkBps ?? 0));
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="smallBold">Last {h.minutes || 1} min</ThemedText>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 48, gap: 3 }}>
        {h.timeline.map((m, i) => (
          <View
            key={i}
            accessibilityLabel={`${formatMbps(m.avgDownlinkBps)}${m.outageSeconds ? `, ${m.outageSeconds} s offline` : ''}`}
            style={{
              flex: 1,
              height: Math.max(3, Math.round(((m.avgDownlinkBps ?? 0) / peak) * 48)),
              borderRadius: 2,
              backgroundColor: m.outageSeconds ? RideColors.red : RideColors.leader,
            }}
          />
        ))}
      </View>
      <ThemedText type="small">
        {formatMbps(h.avgDownlinkBps)} down on average (peak {formatMbps(h.peakDownlinkBps)}), {formatMbps(h.avgUplinkBps)} up
        {h.avgLatencyMs != null ? `, ${Math.round(h.avgLatencyMs)} ms latency` : ''}.{' '}
        {h.outages
          ? `Dropped ${h.outages} ${h.outages === 1 ? 'time' : 'times'} for ${formatSeconds(h.outageSeconds)} in total (longest ${formatSeconds(h.longestOutageS)}).`
          : 'No dropouts.'}
      </ThemedText>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '33.33%', gap: 2 }}>
      <ThemedText type="subtitle" style={{ fontSize: 22, lineHeight: 28 }}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
    </View>
  );
}

// --- Plan and power setup -------------------------------------------------------

function SetupForm({ signedIn }: { signedIn: boolean }) {
  const [vehicles, setVehicles] = useState<VehicleWithCost[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [planName, setPlanName] = useState('');
  const [cost, setCost] = useState('');
  const [cap, setCap] = useState('');
  const [model, setModel] = useState<DishModel | null>(null);
  const [source, setSource] = useState<PowerSource | null>(null);
  const [notes, setNotes] = useState('');
  const [watts, setWatts] = useState('');
  const [hours, setHours] = useState('8');
  const [batteryMode, setBatteryMode] = useState<'wh' | 'ah'>('wh');
  const [wh, setWh] = useState('');
  const [ah, setAh] = useState('');
  const [volts, setVolts] = useState('12');
  const [usable, setUsable] = useState('90');
  const [solar, setSolar] = useState('');
  const [sun, setSun] = useState('5');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (signedIn) myVehicles().then(setVehicles).catch(() => {});
    }, [signedIn]),
  );

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    getStarlinkSetup(vehicleId)
      .then((row) => {
        if (!live) return;
        setPlanName(row?.plan_name ?? '');
        setCost(centsToInput(row?.monthly_cost_cents));
        setCap(numText(row?.data_cap_gb));
        setModel(row?.dish_model ?? null);
        setSource(row?.power_source ?? null);
        setNotes(row?.notes ?? '');
        setWatts(numText(row?.dish_watts));
        setHours(row?.hours_per_day == null ? '8' : String(row.hours_per_day));
        setBatteryMode(row?.battery_wh == null && row?.battery_ah != null ? 'ah' : 'wh');
        setWh(numText(row?.battery_wh));
        setAh(numText(row?.battery_ah));
        setVolts(row?.battery_volts == null ? '12' : String(row.battery_volts));
        setUsable(row?.usable_percent == null ? '90' : String(row.usable_percent));
        setSolar(numText(row?.solar_watts));
        setSun(row?.sun_hours == null ? '5' : String(row.sun_hours));
        setLoaded(true);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [vehicleId, signedIn]);

  const num = (s: string) => {
    const r = parseAmount(s);
    return r.ok ? r.value : null;
  };
  const typical = typicalWatts(model);
  const range = DISH_MODELS.find((d) => d.value === model)?.watts;
  const dishWatts = num(watts) ?? typical ?? 0;
  const hoursPerDay = Math.min(24, num(hours) ?? 0);
  const budget = powerBudget({
    dishWatts,
    hoursPerDay,
    batteryWh: batteryMode === 'wh' ? num(wh) : null,
    batteryAh: batteryMode === 'ah' ? num(ah) : null,
    batteryVolts: batteryMode === 'ah' ? num(volts) : null,
    usablePercent: num(usable),
    solarWatts: num(solar),
    sunHours: num(sun),
  });

  async function save() {
    setError(null);
    setSaved(null);
    const c = parseDollars(cost);
    if (!c.ok) return setError(`Monthly cost: ${c.error}`);
    const fields: [string, string, number][] = [
      ['Data cap', cap, Infinity], ['Dish watts', watts, 1000], ['Hours per day', hours, 24], ['Battery Wh', wh, 1_000_000],
      ['Battery Ah', ah, 100_000], ['Volts', volts, 1000], ['Usable %', usable, 100], ['Solar watts', solar, 100_000], ['Sun hours', sun, 24],
    ];
    for (const [label, text, maxV] of fields) {
      const r = parseAmount(text);
      if (!r.ok) return setError(`${label}: enter a number.`);
      if (r.value != null && r.value > maxV) return setError(`${label}: that is more than ${maxV}.`);
    }
    if (num(usable) != null && num(usable)! < 1) return setError('Usable %: enter 1 to 100.');
    setBusy(true);
    try {
      await saveStarlinkSetup(vehicleId, {
        plan_name: planName.trim() || null,
        monthly_cost_cents: c.cents,
        data_cap_gb: num(cap),
        dish_model: model,
        power_source: source,
        notes: notes.trim() || null,
        dish_watts: num(watts),
        hours_per_day: num(hours),
        battery_wh: batteryMode === 'wh' ? num(wh) : null,
        battery_ah: batteryMode === 'ah' ? num(ah) : null,
        battery_volts: batteryMode === 'ah' ? num(volts) : null,
        usable_percent: num(usable),
        solar_watts: num(solar),
        sun_hours: num(sun),
      });
      setSaved('Saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {vehicles.length ? (
        <Choice
          label="Setup for"
          options={[{ value: null, label: 'General' }, ...vehicles.map((v) => ({ value: v.id as string | null, label: v.nickname || vehicleTitle(v) }))]}
          value={vehicleId}
          onChange={(v) => {
            setLoaded(false);
            setSaved(null);
            setVehicleId(v);
          }}
        />
      ) : null}

      {signedIn ? (
        <Card>
          <ThemedText type="smallBold">My plan</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Starlink doesn’t share plan or usage details with other apps, so jot them down here. Check usage in the Starlink app.
          </ThemedText>
          <Field label="Plan" value={planName} onChangeText={setPlanName} placeholder="e.g. Roam Unlimited" maxLength={80} />
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <View style={{ flex: 1 }}>
              <Field label="Monthly cost ($)" value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="0.00" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Data cap (GB)" value={cap} onChangeText={setCap} keyboardType="decimal-pad" placeholder="Unlimited" />
            </View>
          </View>
          <Choice label="Dish" options={DISH_MODELS.map((d) => ({ value: d.value as DishModel | null, label: d.label }))} value={model} onChange={setModel} />
          <Choice label="Powered by" options={POWER_SOURCES.map((p) => ({ value: p.value as PowerSource | null, label: p.label }))} value={source} onChange={setSource} />
          <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Mount, cable length, router settings" maxLength={1000} />
        </Card>
      ) : null}

      <Card>
        <ThemedText type="smallBold">Power budget</ThemedText>
        {!signedIn ? (
          <Choice label="Dish" options={DISH_MODELS.map((d) => ({ value: d.value as DishModel | null, label: d.label }))} value={model} onChange={setModel} />
        ) : null}
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Dish watts"
              value={watts}
              onChangeText={setWatts}
              keyboardType="decimal-pad"
              placeholder={typical ? String(typical) : 'e.g. 35'}
              hint={range ? `Typical ${range[0]}-${range[1]} W` : 'Pick your dish above'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Hours per day" value={hours} onChangeText={setHours} keyboardType="decimal-pad" placeholder="8" />
          </View>
        </View>
        <Choice
          label="Battery size in"
          options={[{ value: 'wh' as const, label: 'Watt-hours' }, { value: 'ah' as const, label: 'Amp-hours + volts' }]}
          value={batteryMode}
          onChange={setBatteryMode}
        />
        {batteryMode === 'wh' ? (
          <Field label="Battery (Wh)" value={wh} onChangeText={setWh} keyboardType="decimal-pad" placeholder="e.g. 1024" hint="On the label of most power stations" />
        ) : (
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <View style={{ flex: 1 }}>
              <Field label="Battery (Ah)" value={ah} onChangeText={setAh} keyboardType="decimal-pad" placeholder="e.g. 100" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Volts" value={volts} onChangeText={setVolts} keyboardType="decimal-pad" placeholder="12" />
            </View>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <Field label="Usable %" value={usable} onChangeText={setUsable} keyboardType="number-pad" hint="Lithium 90, lead-acid 50" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Solar watts" value={solar} onChangeText={setSolar} keyboardType="decimal-pad" placeholder="0" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Sun hours" value={sun} onChangeText={setSun} keyboardType="decimal-pad" hint="Per day" />
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three, paddingTop: Spacing.two }}>
          <Stat label="Battery runtime" value={budget.usableWh > 0 && dishWatts > 0 ? (budget.runtimeHours >= 10 ? `${Math.round(budget.runtimeHours)} h` : formatHours(budget.runtimeHours)) : '—'} />
          <Stat label="Dish uses / day" value={formatWh(budget.dailyUseWh)} />
          <Stat label="Solar adds / day" value={formatWh(budget.dailySolarWh)} />
        </View>
        <ThemedText type="smallBold" style={{ color: budget.dailyBalanceWh >= 0 ? RideColors.green : RideColors.red }}>
          Daily balance: {budget.dailyBalanceWh >= 0 ? '+' : '−'}{formatWh(Math.abs(budget.dailyBalanceWh))}
        </ThemedText>
        <ThemedText>{budgetSummary(budget, hoursPerDay)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Estimates. Assumes 90% conversion efficiency and 75% of panel rating. Snow melt, heat and heavy use draw more.
        </ThemedText>
      </Card>

      {!signedIn ? (
        <Card>
          <ThemedText type="smallBold">Sign in to save your plan and power setup</ThemedText>
          <Button title="Sign in" onPress={() => router.push('/sign-in')} />
        </Card>
      ) : null}
      {!signedIn ? null : (
        <>
          <ErrorText error={error} />
          {saved ? <ThemedText style={{ color: RideColors.green, fontWeight: '700' }}>{saved}</ThemedText> : null}
          <Button title="Save" big loading={busy} disabled={!loaded} onPress={save} />
        </>
      )}
    </>
  );
}
