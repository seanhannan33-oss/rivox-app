import { useEffect, useState } from "react";
import { Image, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { Body, Button, Label, Screen } from "../../components/ui";
import { earliestStart } from "../../lib/days";
import {
  PLAN,
  REST_SECONDS,
  SETS,
  clock,
  comingUp,
  daysToNextDrop,
  lastWeek,
  logSet,
  repsFor,
  sessionKey,
  stateOf,
  undoSet,
  upNext,
  weekNumber,
  weekStart,
  weekdayOf,
  type DayState,
} from "../../lib/train";
import { useDayLog } from "../../lib/useDayLog";
import { useTrainLog } from "../../lib/useTrainLog";
import { useSession } from "../../session";
import { colors, fonts, radius } from "../../theme";

const STATE_TEXT: Record<DayState, string> = {
  done: "DONE",
  today: "TODAY",
  owed: "YOU OWE THIS ONE",
  ahead: "NO EXCUSES YET",
};

export default function Train() {
  const { access } = useSession();
  const { today, firstDay } = useDayLog();
  const { ready, log, update } = useTrainLog(today);

  const start = earliestStart([access?.details?.no_curfew?.startedAt, access?.details?.pouches?.startedAt]) ?? firstDay;
  const week = weekNumber(start, today);
  const thisWeek = weekStart(today);
  const wd = weekdayOf(today);
  const drop = daysToNextDrop(today);

  const session = upNext(log, today);
  const key = session ? sessionKey(thisWeek, session.move) : null;
  const entry = key ? log[key] : undefined;
  const setsDone = entry?.sets ?? 0;
  const reps = session ? repsFor(session, week) : 0;
  const before = session ? lastWeek(log, today, session.move) : null;

  // Rest timer. Stored as an end time so it stays right if the screen re-renders or the app naps.
  const [restEnds, setRestEnds] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (restEnds === null) return;
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, [restEnds]);
  const restLeft = restEnds === null ? 0 : (restEnds - nowMs) / 1000;
  const resting = restEnds !== null && restLeft > 0;
  useEffect(() => {
    if (restEnds !== null && restLeft <= 0) setRestEnds(null);
  }, [restEnds, restLeft]);

  function finishSet() {
    if (!key) return;
    update(key, (prev) => logSet(prev, reps, today));
    if (setsDone + 1 < SETS) {
      setNowMs(Date.now());
      setRestEnds(Date.now() + REST_SECONDS * 1000);
    } else {
      setRestEnds(null);
    }
  }

  const next = comingUp(today);

  return (
    <Screen bottomInset={false} flush>
      <ImageBackground source={require("../../../assets/brand/banner-train.jpg")} style={s.banner} resizeMode="cover">
        <View style={s.bannerShade} />
        <Image
          source={require("../../../assets/brand/logo.png")}
          style={s.logo}
          resizeMode="contain"
          accessibilityLabel="Rivox Labs"
        />
        <View style={s.pill}>
          <Text style={s.pillText}>RIVOX MEMBER</Text>
        </View>
      </ImageBackground>

      <View style={s.body}>
        <Label>THE 5 A.M. CLUB</Label>

        {session ? (
          <>
            <Text style={s.h1}>{SETS} SETS.</Text>
            <Text style={[s.h1, s.yellow]}>{reps} REPS.</Text>
            <Body style={s.what}>
              {session.what} {session.cue}
            </Body>

            <View style={s.sets} accessibilityLabel={`${setsDone} of ${SETS} sets done`}>
              {Array.from({ length: SETS }, (_, i) => {
                const done = i < setsDone;
                const current = i === setsDone;
                return (
                  <View key={i} style={[s.set, done && s.setDone, current && s.setNext]}>
                    <Text style={[s.setReps, done && s.setRepsDone]}>{reps}</Text>
                    <Text style={[s.setLabel, done && s.setLabelDone]}>{current ? "UP NEXT" : `SET ${i + 1}`}</Text>
                  </View>
                );
              })}
            </View>

            {resting ? (
              <Pressable
                onPress={() => setRestEnds(null)}
                accessibilityRole="button"
                accessibilityLabel={`Resting. ${Math.ceil(restLeft)} seconds left. Tap to skip.`}
                style={s.rest}
              >
                <Text style={s.restClock}>REST {clock(restLeft)}</Text>
                <Text style={s.restSkip}>Tap to skip. Or breathe. Your call.</Text>
              </Pressable>
            ) : (
              <Button title={`SET ${setsDone + 1}. GO.`} onPress={finishSet} disabled={!ready} />
            )}

            <View style={s.under}>
              <Text style={s.note}>
                {before
                  ? `Last week: ${before.sets} x ${before.reps}. Beat it.`
                  : `Tap when the set is done. ${REST_SECONDS} seconds rest between sets.`}
              </Text>
              {setsDone > 0 ? (
                <Pressable onPress={() => key && update(key, undoSet)} accessibilityRole="button" hitSlop={8}>
                  <Text style={s.undo}>Undo last set</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <Text style={s.h1}>NOTHING DUE.</Text>
            <Text style={[s.h1, s.yellow]}>{next ? "REST." : "WEEK DONE."}</Text>
            <Body style={s.what}>
              {next
                ? `Next up: ${next.dayLabel}, ${next.name.toLowerCase()}. Eat, sleep, show up.`
                : `That's the week. New one drops in ${drop} ${drop === 1 ? "day" : "days"}.`}
            </Body>
          </>
        )}

        <View style={s.weekHead}>
          <Label>WEEK {week} · DROPPED SUNDAY</Label>
          <Text style={s.nextDrop}>
            NEXT DROP IN {drop} {drop === 1 ? "DAY" : "DAYS"}
          </Text>
        </View>
        {PLAN.map((p) => {
          const st = stateOf(p, log[sessionKey(thisWeek, p.move)], wd);
          return (
            <View key={p.move} style={[s.day, st === "today" && s.dayToday]}>
              <Text style={s.dayText}>
                {p.dayLabel} · {p.name}
              </Text>
              <Text style={[s.dayState, st === "done" && s.yellow, st === "today" && s.yellow, st === "owed" && s.pink]}>
                {STATE_TEXT[st]}
              </Text>
            </View>
          );
        })}

        <Text style={s.footer}>WIND DOWN WHEN YOU'RE DEAD.</Text>
        <Text style={s.safety}>
          New to training, or coming back from an injury? Talk to your doctor before you start. Stop if something hurts.
        </Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  banner: { height: 104, justifyContent: "center", paddingHorizontal: 24 },
  bannerShade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(7,18,36,0.55)" },
  logo: { width: 120, height: 42 },
  pill: {
    position: "absolute",
    right: 24,
    top: 38,
    backgroundColor: colors.yellow,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillText: { fontFamily: fonts.bold, color: colors.ink, fontSize: 11, letterSpacing: 1 },
  body: { paddingHorizontal: 24, paddingTop: 24 },
  h1: { fontFamily: fonts.headline, color: colors.text, fontSize: 52, lineHeight: 54 },
  yellow: { color: colors.yellow },
  pink: { color: colors.pink },
  what: { marginTop: 10 },
  sets: { flexDirection: "row", gap: 8, marginTop: 20, marginBottom: 16 },
  set: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 12,
  },
  setDone: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  setNext: { borderColor: colors.yellow, borderWidth: 2 },
  setReps: { fontFamily: fonts.headline, color: colors.text, fontSize: 26 },
  setRepsDone: { color: colors.ink },
  setLabel: { fontFamily: fonts.bold, color: colors.muted, fontSize: 10, letterSpacing: 1, marginTop: 2 },
  setLabelDone: { color: colors.ink },
  rest: {
    minHeight: 56,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.pink,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  restClock: { fontFamily: fonts.headline, color: colors.pink, fontSize: 22 },
  restSkip: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, marginTop: 2 },
  under: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 12 },
  note: { fontFamily: fonts.medium, color: colors.secondary, fontSize: 13, flexShrink: 1 },
  undo: { fontFamily: fonts.bold, color: colors.muted, fontSize: 13 },
  weekHead: { marginTop: 36, marginBottom: 10 },
  nextDrop: { fontFamily: fonts.headline, color: colors.text, fontSize: 20, marginTop: 4 },
  day: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 52,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  dayToday: { borderColor: colors.yellow },
  dayText: { fontFamily: fonts.medium, color: colors.text, fontSize: 15 },
  dayState: { fontFamily: fonts.bold, color: colors.muted, fontSize: 11, letterSpacing: 1 },
  footer: { fontFamily: fonts.headline, color: colors.muted, fontSize: 18, textAlign: "center", marginTop: 28 },
  safety: { fontFamily: fonts.body, color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 10 },
});
