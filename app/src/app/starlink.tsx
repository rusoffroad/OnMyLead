import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

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
  DISH_HOST, DishError, dishReadSupported, formatMbps, formatPercent, formatUptime, readDish, type DishReading,
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
      {!loading && !session ? (
        <Card>
          <ThemedText type="smallBold">Sign in to save your plan and power setup</ThemedText>
          <Button title="Sign in" onPress={() => router.push('/sign-in')} />
        </Card>
      ) : session ? (
        <SetupForm />
      ) : null}
    </Screen>
  );
}

// --- Live dish status -----------------------------------------------------------

function DishStatusCard() {
  const theme = useTheme();
  const [reading, setReading] = useState<DishReading | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DishError | null>(null);

  async function connect() {
    setBusy(true);
    setFailure(null);
    try {
      setReading(await readDish());
    } catch (e) {
      setFailure(e instanceof DishError ? e : new DishError('unreachable', e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

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

  const s = reading?.status;
  const h = reading?.history;
  return (
    <Card>
      <ThemedText type="smallBold">Your dish</ThemedText>
      {!reading && !failure ? (
        <ThemedText type="small" themeColor="textSecondary">Connect your phone to your Starlink Wi-Fi first, then tap the button.</ThemedText>
      ) : null}

      {failure ? (
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="subtitle">Can’t reach your dish</ThemedText>
          <ThemedText>
            {failure.kind === 'refused' || failure.kind === 'unreadable'
              ? 'Your dish answered but we could not read it. A Starlink software update may have changed things. Try again later.'
              : 'Join your Starlink Wi-Fi, then tap Retry.'}
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
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.three }}>
            <Stat label="Download" value={formatMbps(s.downlinkBps)} />
            <Stat label="Upload" value={formatMbps(s.uplinkBps)} />
            <Stat label="Latency" value={s.latencyMs == null ? '—' : `${Math.round(s.latencyMs)} ms`} />
            <Stat label="Obstructed" value={formatPercent(s.obstructionFraction)} />
            <Stat label="Dropped pings" value={formatPercent(s.dropRate)} />
            <Stat label="Up for" value={formatUptime(s.uptimeS)} />
          </View>
          {s.currentlyObstructed ? <ThemedText style={{ color: RideColors.yellow, fontWeight: '700' }}>Something is blocking the sky right now.</ThemedText> : null}
          {s.alerts.length ? (
            <View style={{ gap: Spacing.one }}>
              <ThemedText type="smallBold">Alerts</ThemedText>
              {s.alerts.map((a) => <ThemedText key={a.code}>• {a.text}</ThemedText>)}
            </View>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">No alerts.</ThemedText>
          )}
          {h && h.samples > 0 ? (
            <ThemedText type="small">
              Last {h.minutes || 1} min: {formatMbps(h.avgDownlinkBps)} down on average (peak {formatMbps(h.peakDownlinkBps)}),
              {' '}{formatMbps(h.avgUplinkBps)} up{h.avgLatencyMs != null ? `, ${Math.round(h.avgLatencyMs)} ms latency` : ''}, {formatPercent(h.avgDropRate)} dropped.
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {[
              s.softwareVersion ? `Software ${s.softwareVersion}` : null,
              s.hardwareVersion ? `Hardware ${s.hardwareVersion}` : null,
              s.gpsSats != null ? `GPS ${s.gpsValid ? 'locked' : 'searching'}, ${s.gpsSats} sats` : null,
              s.ethSpeedMbps ? `Ethernet ${s.ethSpeedMbps} Mbps` : null,
              s.elevationDeg != null ? `Aimed ${Math.round(s.elevationDeg)}° up` : null,
            ].filter(Boolean).join(' · ')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Read at {new Date(reading!.readAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</ThemedText>
        </View>
      ) : null}

      <Button
        title={busy ? 'Connecting…' : failure ? 'Retry' : reading ? 'Refresh' : 'Connect to my dish'}
        big
        disabled={busy}
        onPress={connect}
      />
      {busy ? <ActivityIndicator color={theme.accent} /> : null}
      <ThemedText type="small" themeColor="textSecondary">
        This uses your dish’s built-in local connection, which SpaceX doesn’t officially support. A Starlink update can break it;
        everything else on this page keeps working.
      </ThemedText>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '33.33%', gap: 2 }}>
      <ThemedText type="subtitle">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
    </View>
  );
}

// --- Plan and power setup -------------------------------------------------------

function SetupForm() {
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
      myVehicles().then(setVehicles).catch(() => {});
    }, []),
  );

  useEffect(() => {
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
  }, [vehicleId]);

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

      <Card>
        <ThemedText type="smallBold">Power budget</ThemedText>
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
          <Stat label="Battery runtime" value={budget.usableWh > 0 && dishWatts > 0 ? formatHours(budget.runtimeHours) : '—'} />
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

      <ErrorText error={error} />
      {saved ? <ThemedText style={{ color: RideColors.green, fontWeight: '700' }}>{saved}</ThemedText> : null}
      <Button title="Save" big loading={busy} disabled={!loaded} onPress={save} />
    </>
  );
}
