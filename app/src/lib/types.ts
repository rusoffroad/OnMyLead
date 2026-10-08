import type { BubblePreset, RideRole } from '@/core/bubble';
import type { AreaId, VehicleKind } from '@/core/garage';
import type { JoinPolicy, MemberStatus } from '@/core/joining';
import type { DishModel, PowerSource } from '@/core/power';
import type { TripCategory } from '@/core/trips';

export type Visibility = 'public' | 'unlisted' | 'private';
export type RideStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type MemberRole = 'organizer' | 'co_organizer' | 'leader' | 'sweep' | 'rider';

export type Ride = {
  id: string;
  organizer_id: string;
  invite_code: string;
  name: string;
  description: string | null;
  meet_at: string;
  depart_at: string | null;
  expected_finish_at: string | null;
  meet_area_lat: number;
  meet_area_lng: number;
  meet_area_label: string | null;
  /** Two-letter US state; null on rides saved before the discovery migration. */
  meet_state?: string | null;
  destination_label: string | null;
  vehicle_types: string[];
  difficulty: string | null;
  experience_level: string | null;
  max_riders: number | null;
  max_vehicles: number | null;
  what_to_bring: string | null;
  required_equipment: string | null;
  fuel_notes: string | null;
  route_miles: number | null;
  visibility: Visibility;
  join_policy: JoinPolicy;
  bubble_preset: BubblePreset | 'custom';
  status: RideStatus;
  started_at: string | null;
  ended_at: string | null;
};

export type RidePrivateDetails = {
  ride_id: string;
  meet_lat: number;
  meet_lng: number;
  meet_label: string | null;
  instructions: string | null;
};

export type RideMember = {
  ride_id: string;
  user_id: string;
  status: MemberStatus;
  role: MemberRole;
  vehicle_id: string | null;
  riders: number;
  vehicles: number;
  checked_in_at: string | null;
  left_at: string | null;
  profiles?: { display_name: string; photo_url: string | null } | null;
};

export type Position = {
  user_id: string;
  lat: number;
  lng: number;
  speed_mps: number | null;
  heading_deg: number | null;
  last_moved_at: string | null;
  recorded_at: string;
};

export type RiderStatusKind =
  | 'ok' | 'stopped' | 'need_fuel' | 'mechanical' | 'flat_tire' | 'stuck' | 'lost' | 'need_help' | 'emergency';

export type RegroupPoint = { id: string; ride_id: string; lat: number; lng: number; label: string | null; created_at: string; cleared_at: string | null };

/** Map a membership role to the Ride Bubble role. */
export const bubbleRole = (role: MemberRole): RideRole =>
  role === 'leader' ? 'leader' : role === 'sweep' ? 'sweep' : 'rider';

export type Vehicle = {
  id: string;
  owner_id: string;
  kind: VehicleKind;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  vin: string | null;
  nickname: string | null;
  photo_url: string | null;
  seats: number | null;
  engine_hours: number | null;
  odometer_miles: number | null;
  tank_gallons: number | null;
  extra_fuel_gallons: number | null;
  mpg: number | null;
  purchase_price_cents: number | null;
  created_at: string;
};

export type VehicleItem = {
  id: string;
  vehicle_id: string;
  area: AreaId;
  name: string;
  brand: string | null;
  cost_cents: number | null;
  installed_on: string | null;
  notes: string | null;
  created_at: string;
};

export type Trip = {
  id: string;
  owner_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  ride_id: string | null;
  vehicle_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TripItem = {
  id: string;
  trip_id: string;
  name: string;
  category: TripCategory;
  checked: boolean;
  quantity: number;
  notes: string | null;
  position: number;
  created_at: string;
};

export type StarlinkSetup = {
  id: string;
  owner_id: string;
  vehicle_id: string | null;
  plan_name: string | null;
  monthly_cost_cents: number | null;
  data_cap_gb: number | null;
  dish_model: DishModel | null;
  power_source: PowerSource | null;
  notes: string | null;
  dish_watts: number | null;
  hours_per_day: number | null;
  battery_wh: number | null;
  battery_ah: number | null;
  battery_volts: number | null;
  usable_percent: number | null;
  solar_watts: number | null;
  sun_hours: number | null;
  updated_at: string;
};
