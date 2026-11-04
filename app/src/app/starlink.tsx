import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

import { FlagGate } from '@/components/app-notices';
import { StarlinkMountAd } from '@/components/starlink-mount-ad';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Choice, ErrorText, Field, Screen, Tag } from '@/components/ui';
import { RideColors, Spacing } from '@/constants/theme';
import { centsToInput, parseAmount, parseDollars, vehicleTitle } from '@/core/garage';
import {
  DISH_MODELS, POWER_SOURCES, budgetSummary, formatHours, formatWh, powerBudget, typicalWatts, type DishModel, type PowerSource,
} from '@/core/power';
import { getStarlinkSetup, myVehicles, saveStarlinkSetup, type VehicleWithCost } from '@/lib/api';
import { setSyncedItem } from '@/lib/settings-sync';
import { useSession } from '@/lib/session';
import {
  compassPoint, DISH_HOST, DishError, dishHeadline, dishReadSupported, formatMbps, formatPercent, formatSeconds, formatUptime,
  readHistory, readStatus, type DishHistory, type DishStatus,
} from '@/lib/starlink';
import { useTheme } from '@/hooks/use-theme';

import { t as tr } from '@/lib/i18n';
const numText = (n: number | null | undefined) => (n == null ? '' : String(n));

export default function StarlinkPageScreen() {
  return (
    <FlagGate flag="starlink">
      <StarlinkPage />
    </FlagGate>
  );
}

function StarlinkPage() {
  const { session, loading } = useSession();
  return (
    <Screen>
      <ThemedText themeColor="textSecondary">
        {tr('See how your dish is doing, keep your plan details handy, and work out how long your batteries will run it.')}
      </ThemedText>
      <DishStatusCard />
      <StarlinkMountAd />
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
    setSyncedItem(AUTO_KEY, '1').catch(() => {});
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
        <ThemedText type="heading">{tr('Your Dish')}</ThemedText>
        <ThemedText>{tr('Reading your dish only works in the OnMyLead phone app. Your dish talks to devices on its own Wi-Fi at {DISH_HOST}, and web browsers block a secure web page from reaching it.', { DISH_HOST })}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{tr('You can still save your plan and use the power calculator below.')}</ThemedText>
      </Card>
    );
  }

  const ageS = readAt ? Math.max(0, Math.round((now - readAt) / 1000)) : null;
  const facing = s ? compassPoint(s.azimuthDeg) : null;
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <ThemedText type="heading">{tr('Your Dish')}</ThemedText>
        {live ? (
          <Tag label={tr('Live')} color={RideColors.green} solid />
        ) : s && ageS != null ? (
          <ThemedText type="small" themeColor="textSecondary">{tr('Last read {v} ago', { v: formatSeconds(ageS) })}</ThemedText>
        ) : null}
      </View>
      {!s && !failure && !connecting ? (
        <ThemedText type="small" themeColor="textSecondary">
          {tr('Join your Starlink Wi-Fi, then tap Connect. This page then stays live while it is open.')}
        </ThemedText>
      ) : null}

      {failure ? (
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="subtitle">{tr('Can’t Reach Your Dish')}</ThemedText>
          <ThemedText>
            {failure.kind === 'refused' || failure.kind === 'unreadable'
              ? tr('Your dish answered but we could not read it. A Starlink software update may have changed things. Try again later.')
              : tr('Join your Starlink Wi-Fi and allow OnMyLead to use your local network (Settings › OnMyLead). We keep trying every 10 seconds.')}
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
            <Stat label={tr('Download Now')} value={formatMbps(s.downlinkBps)} />
            <Stat label={tr('Upload Now')} value={formatMbps(s.uplinkBps)} />
            <Stat label={tr('Latency')} value={s.latencyMs == null ? '—' : `${Math.round(s.latencyMs)} ms`} />
            <Stat label={tr('Sky Blocked')} value={formatPercent(s.obstructionFraction)} />
            <Stat label={tr('Dropped Pings')} value={formatPercent(s.dropRate)} />
            <Stat label={tr('Up For')} value={formatUptime(s.uptimeS)} />
          </View>
          {s.alerts.length ? (
            <View style={{ gap: Spacing.one }}>
              <ThemedText style={{ fontWeight: 700 }}>{tr('Alerts')}</ThemedText>
              {s.alerts.map((a) => (
                <ThemedText key={a.code} style={{ color: RideColors.yellow, fontWeight: 600 }}>{a.text}</ThemedText>
              ))}
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">{tr('No alerts.')}</ThemedText>
          )}
          {h && h.samples > 0 ? <HistoryView h={h} /> : null}
          <ThemedText type="small" themeColor="textSecondary">
            {[
              facing && s.elevationDeg != null ? tr('Facing {facing}, {v}° up', { facing, v: Math.round(s.elevationDeg) }) : null,
              s.gpsSats != null ? `GPS ${s.gpsValid ? 'locked' : 'searching'}, ${s.gpsSats} sats` : null,
              s.ethSpeedMbps ? tr('Ethernet {ethSpeedMbps} Mbps', { ethSpeedMbps: s.ethSpeedMbps }) : null,
              s.softwareVersion ? tr('Software {softwareVersion}', { softwareVersion: s.softwareVersion }) : null,
              s.hardwareVersion ? tr('Hardware {hardwareVersion}', { hardwareVersion: s.hardwareVersion }) : null,
            ].filter(Boolean).join('. ')}
          </ThemedText>
        </View>
      ) : null}

      {!live ? (
        <Button
          title={connecting ? tr('Connecting…') : failure ? tr('Retry Now') : tr('Connect to My Dish')}
          big
          disabled={connecting}
          onPress={connect}
        />
      ) : null}
      {connecting && !s ? <ActivityIndicator color={theme.accent} /> : null}
      <ThemedText type="small" themeColor="textSecondary">
        {tr('This uses your dish’s built-in local connection, which SpaceX doesn’t officially support. A Starlink update can break it; everything else on this page keeps working.')}
      </ThemedText>
    </Card>
  );
}

/** The last 15 minutes: one bar per minute for download speed, red where the connection dropped. */
function HistoryView({ h }: { h: DishHistory }) {
  const theme = useTheme();
  const peak = Math.max(1, ...h.timeline.map((m) => m.avgDownlinkBps ?? 0));
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText style={{ fontWeight: 700 }}>{tr('Last {v} Min', { v: h.minutes || 1 })}</ThemedText>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 48, gap: 3 }}>
        {h.timeline.map((m, i) => (
          <View
            key={i}
            accessibilityLabel={`${formatMbps(m.avgDownlinkBps)}${m.outageSeconds ? `, ${m.outageSeconds} s offline` : ''}`}
            style={{
              flex: 1,
              height: Math.max(3, Math.round(((m.avgDownlinkBps ?? 0) / peak) * 48)),
              borderRadius: 2,
              backgroundColor: m.outageSeconds ? RideColors.red : theme.sky,
            }}
          />
        ))}
      </View>
      <ThemedText type="small">{tr('{v} down on average (peak {v2}), {v3} up{v4}. {v5}', { v: formatMbps(h.avgDownlinkBps), v2: formatMbps(h.peakDownlinkBps), v3: formatMbps(h.avgUplinkBps), v4: h.avgLatencyMs != null ? `, ${tr('{ms} ms latency', { ms: Math.round(h.avgLatencyMs) })}` : '', v5: h.outages
          ? tr(h.outages === 1 ? 'Dropped {n} time for {total} in total (longest {longest}).' : 'Dropped {n} times for {total} in total (longest {longest}).', { n: h.outages, total: formatSeconds(h.outageSeconds), longest: formatSeconds(h.longestOutageS) })
          : tr('No dropouts.') })}</ThemedText>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '33.33%', gap: 2 }}>
      <ThemedText type="subtitle" style={{ fontSize: 28, lineHeight: 32 }}>{value}</ThemedText>
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
    if (!c.ok) return setError(tr('Monthly cost: {error}', { error: c.error }));
    const fields: [string, string, number][] = [
      ['Data cap', cap, Infinity], ['Dish watts', watts, 1000], ['Hours per day', hours, 24], ['Battery Wh', wh, 1_000_000],
      ['Battery Ah', ah, 100_000], ['Volts', volts, 1000], ['Usable %', usable, 100], ['Solar watts', solar, 100_000], ['Sun hours', sun, 24],
    ];
    for (const [label, text, maxV] of fields) {
      const r = parseAmount(text);
      if (!r.ok) return setError(`${label}: enter a number.`);
      if (r.value != null && r.value > maxV) return setError(tr('{label}: that is more than {maxV}.', { label, maxV }));
    }
    if (num(usable) != null && num(usable)! < 1) return setError(tr('Usable %: enter 1 to 100.'));
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
      setError(e instanceof Error ? e.message : tr('Could not save.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {vehicles.length ? (
        <Choice
          label={tr('Setup For')}
          options={[{ value: null, label: tr('General') }, ...vehicles.map((v) => ({ value: v.id as string | null, label: v.nickname || vehicleTitle(v) }))]}
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
          <ThemedText type="heading">{tr('My Plan')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {tr('Starlink doesn’t share plan or usage details with other apps, so jot them down here. Check usage in the Starlink app.')}
          </ThemedText>
          <Field label={tr('Plan')} value={planName} onChangeText={setPlanName} placeholder={tr('e.g. Roam Unlimited')} maxLength={80} />
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <View style={{ flex: 1 }}>
              <Field label={tr('Monthly Cost ($)')} value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="0.00" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={tr('Data Cap (GB)')} value={cap} onChangeText={setCap} keyboardType="decimal-pad" placeholder={tr('Unlimited')} />
            </View>
          </View>
          <Choice label={tr('Dish')} options={DISH_MODELS.map((d) => ({ value: d.value as DishModel | null, label: d.label }))} value={model} onChange={setModel} />
          <Choice label={tr('Powered By')} options={POWER_SOURCES.map((p) => ({ value: p.value as PowerSource | null, label: p.label }))} value={source} onChange={setSource} />
          <Field label={tr('Notes')} value={notes} onChangeText={setNotes} multiline placeholder={tr('Mount, cable length, router settings')} maxLength={1000} />
        </Card>
      ) : null}

      <Card>
        <ThemedText type="heading">{tr('Power Budget')}</ThemedText>
        {!signedIn ? (
          <Choice label={tr('Dish')} options={DISH_MODELS.map((d) => ({ value: d.value as DishModel | null, label: d.label }))} value={model} onChange={setModel} />
        ) : null}
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <Field
              label={tr('Dish Watts')}
              value={watts}
              onChangeText={setWatts}
              keyboardType="decimal-pad"
              placeholder={typical ? String(typical) : 'e.g. 35'}
              hint={range ? tr('Typical {v}-{v2} W', { v: range[0], v2: range[1] }) : tr('Pick your dish above')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={tr('Hours per Day')} value={hours} onChangeText={setHours} keyboardType="decimal-pad" placeholder="8" />
          </View>
        </View>
        <Choice
          label={tr('Battery Size In')}
          options={[{ value: 'wh' as const, label: tr('Watt-Hours') }, { value: 'ah' as const, label: tr('Amp-Hours + Volts') }]}
          value={batteryMode}
          onChange={setBatteryMode}
        />
        {batteryMode === 'wh' ? (
          <Field label={tr('Battery (Wh)')} value={wh} onChangeText={setWh} keyboardType="decimal-pad" placeholder="e.g. 1024" hint={tr('On the label of most power stations')} />
        ) : (
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            <View style={{ flex: 1 }}>
              <Field label={tr('Battery (Ah)')} value={ah} onChangeText={setAh} keyboardType="decimal-pad" placeholder="e.g. 100" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={tr('Volts')} value={volts} onChangeText={setVolts} keyboardType="decimal-pad" placeholder="12" />
            </View>
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <View style={{ flex: 1 }}>
            <Field label={tr('Usable %')} value={usable} onChangeText={setUsable} keyboardType="number-pad" hint={tr('Lithium 90, lead-acid 50')} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={tr('Solar Watts')} value={solar} onChangeText={setSolar} keyboardType="decimal-pad" placeholder="0" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={tr('Sun Hours')} value={sun} onChangeText={setSun} keyboardType="decimal-pad" hint={tr('Per day')} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three, paddingTop: Spacing.two }}>
          <Stat label={tr('Battery Runtime')} value={budget.usableWh > 0 && dishWatts > 0 ? (budget.runtimeHours >= 10 ? `${Math.round(budget.runtimeHours)} h` : formatHours(budget.runtimeHours)) : '—'} />
          <Stat label={tr('Dish Uses / Day')} value={formatWh(budget.dailyUseWh)} />
          <Stat label={tr('Solar Adds / Day')} value={formatWh(budget.dailySolarWh)} />
        </View>
        <ThemedText type="heading" style={{ color: budget.dailyBalanceWh >= 0 ? RideColors.green : RideColors.red }}>{tr('Daily balance: {v}{v2}', { v: budget.dailyBalanceWh >= 0 ? '+' : '−', v2: formatWh(Math.abs(budget.dailyBalanceWh)) })}</ThemedText>
        <ThemedText>{budgetSummary(budget, hoursPerDay)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {tr('Estimates. Assumes 90% conversion efficiency and 75% of panel rating. Snow melt, heat and heavy use draw more.')}
        </ThemedText>
      </Card>

      {!signedIn ? (
        <Card>
          <ThemedText type="heading">{tr('Sign In to Save Your Plan and Power Setup')}</ThemedText>
          <Button title={tr('Sign In')} onPress={() => router.push('/sign-in')} />
        </Card>
      ) : null}
      {!signedIn ? null : (
        <>
          <ErrorText error={error} />
          {saved ? <ThemedText style={{ color: RideColors.green, fontWeight: 700 }}>{saved}</ThemedText> : null}
          <Button title={tr('Save')} big loading={busy} disabled={!loaded} onPress={save} />
        </>
      )}
    </>
  );
}
