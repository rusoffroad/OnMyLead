/**
 * The CarPlay screen's parts that don't belong to one phone screen (3.1): the Map Features the car
 * map draws and its Layers screen, the rider's group chats from the car's Messages button, and the
 * home screen's Open Ride Mode while this phone shares on a ride. Mounted once in the root layout;
 * renders nothing, and does nothing off iPhone or in builds without the CarPlay module.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { applyFeatureChanges, carLayerRows, carLayerToggle, carTrails } from '@/core/car-layers';
import {
  carChat, carChatRows, carPlayReplies, carSpokenMessage, parseCarPlayAction, type CarChatGroup, type CarMessageInput,
} from '@/core/carplay';
import { withoutBlocked } from '@/core/blocks';
import { QUICK_REPLIES } from '@/core/chat';
import { anyTrails, defaultFeatures, MAP_FEATURE_IDS, readFeatures, type FeatureChoices } from '@/core/map-features';
import { parseSavedReplies } from '@/core/ride-message';
import { MAP_LAYERS_KEY } from '@/hooks/use-trail-map';
import { blockedIds } from '@/lib/blocks';
import {
  carPlayAvailable, onCarPlayAction, setCarPlayHome, showChatOnCarPlay, showChatsOnCarPlay, showTrailsOnCarPlay,
} from '@/lib/carplay';
import { currentEntitlements } from '@/lib/entitlements';
import { groupMessages, myGroupChats, sendGroupMessage } from '@/lib/group-chat';
import { myGroups, type RidingGroup } from '@/lib/groups';
import { sharingRideId } from '@/lib/location';
import { useCan } from '@/lib/pro';
import { can } from '@/core/entitlements';
import { tc } from '@/core/i18n';
import { useSession } from '@/lib/session';
import { onSyncedChange, setSyncedItem } from '@/lib/settings-sync';
import { speak } from '@/lib/voice';

/** Messages a car chat shows (the newest; core/carplay CAR_MESSAGES_MAX keeps 12 of them). */
const CHAT_LOAD = 30;
const SAVED_REPLIES_KEY = 'ride.savedReplies.v1';
const NO_FEATURES = Object.fromEntries(MAP_FEATURE_IDS.map((k) => [k, false])) as FeatureChoices;

export function CarPlayHome() {
  const layersPro = useCan('map_layers');
  const carPlayPro = useCan('carplay');
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const features = useRef<FeatureChoices>(defaultFeatures());

  // Map Features: the same saved choices as every map in the app, here and on the car.
  useEffect(() => {
    if (!carPlayAvailable) return;
    const send = () => {
      const f = layersPro ? features.current : NO_FEATURES;
      showTrailsOnCarPlay(carTrails(f), carLayerRows(f));
    };
    const apply = (v: string | null) => {
      try {
        features.current = readFeatures(v ? JSON.parse(v) : null);
      } catch {
        features.current = defaultFeatures();
      }
      send();
    };
    AsyncStorage.getItem(MAP_LAYERS_KEY).then(apply).catch(() => send());
    return onSyncedChange(MAP_LAYERS_KEY, apply);
  }, [layersPro]);

  // Open Ride Mode on the car's home screen while this phone shares on a ride.
  useEffect(() => {
    if (!carPlayAvailable || !carPlayPro) return;
    let live = true;
    const check = () => sharingRideId().then((id) => live && setCarPlayHome(!!id)).catch(() => {});
    check();
    const t = setInterval(check, 10_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [carPlayPro]);

  // Button presses on the car's Layers, group chat and home screens.
  const groups = useRef<RidingGroup[]>([]);
  const messages = useRef(new Map<string, CarMessageInput[]>());
  useEffect(() => {
    if (!carPlayAvailable) return;
    const nameIn = (groupId: string) => {
      const names = new Map((groups.current.find((g) => g.id === groupId)?.riders ?? []).map((r) => [r.id, r.name]));
      return (uid: string) => names.get(uid) ?? tc('Rider');
    };
    const loadChats = async () => {
      const [list, summaries] = await Promise.all([myGroups(), myGroupChats().catch(() => [])]);
      groups.current = list;
      const rows = carChatRows(
        list.map((g): CarChatGroup => ({ id: g.id, name: g.name })),
        summaries.map((s) => ({ groupId: s.group_id, lastBody: s.last_body, lastAt: s.last_at, unread: s.unread })),
        Date.now(),
      );
      showChatsOnCarPlay(rows);
    };
    const loadChat = async (groupId: string) => {
      const group = groups.current.find((g) => g.id === groupId);
      if (!group) return;
      const rows = withoutBlocked(await groupMessages(groupId, CHAT_LOAD), blockedIds(), me);
      const inputs: CarMessageInput[] = rows.map((m) => ({ id: m.id, userId: m.user_id, kind: 'chat', body: m.body, sentAt: m.sent_at }));
      messages.current.set(groupId, inputs);
      const saved = parseSavedReplies(await AsyncStorage.getItem(SAVED_REPLIES_KEY).catch(() => null));
      showChatOnCarPlay(carChat({ id: group.id, name: group.name }, inputs, nameIn(groupId), me, Date.now(), carPlayReplies(saved, QUICK_REPLIES)));
    };
    const sub = onCarPlayAction((id) => {
      const a = parseCarPlayAction(id);
      if (!can(currentEntitlements(), 'carplay')) return;
      if (a.type === 'layer') {
        const changes = carLayerToggle(features.current, a.rowId);
        if (!changes.length) return;
        const next = applyFeatureChanges(features.current, changes);
        features.current = next;
        showTrailsOnCarPlay(carTrails(next), carLayerRows(next));
        // Saved like the phone's Map Settings, so every open map follows (lib/settings-sync).
        AsyncStorage.getItem(MAP_LAYERS_KEY)
          .catch(() => null)
          .then((v) => {
            let saved: Record<string, unknown> = {};
            try {
              saved = v ? JSON.parse(v) : {};
            } catch {
              saved = {};
            }
            return setSyncedItem(MAP_LAYERS_KEY, JSON.stringify({ ...saved, trailsOn: anyTrails(next), features: next }));
          })
          .catch(() => {});
      } else if (a.type === 'chats') {
        loadChats().catch(() => showChatsOnCarPlay([]));
      } else if (a.type === 'chat') {
        loadChat(a.groupId).catch(() => {});
      } else if (a.type === 'chat_hear') {
        const m = messages.current.get(a.groupId)?.find((x) => x.id === a.messageId);
        if (m) speak(carSpokenMessage(m, nameIn(a.groupId)));
      } else if (a.type === 'chat_say') {
        sendGroupMessage(a.groupId, a.body, null, new Date())
          .then(() => loadChat(a.groupId))
          .catch(() => speak(tc('Your reply wasn’t sent. Check your signal and try again.')));
      } else if (a.type === 'open_ride') {
        sharingRideId()
          .then((rideId) => rideId && router.navigate(`/ride/${rideId}/live` as never))
          .catch(() => {});
      }
    });
    return () => sub.remove();
  }, [me]);

  return null;
}
