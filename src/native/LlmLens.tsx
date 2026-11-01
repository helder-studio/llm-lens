import { type ReactNode, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LlmCall } from '../core/store';
import { llmLens } from '../lens';
import { describeCall, type LlmLensProps, summary, useActivation, useCalls } from '../react/shared';

/** React Native: records LLM calls, shows a badge, and opens the call list on tap. */
export function LlmLens(props: LlmLensProps & { children?: ReactNode }) {
  useActivation(props);
  const [open, setOpen] = useState(false);
  const calls = useCalls();
  const totals = llmLens.totals();
  return (
    <>
      {props.children}
      {props.enabled && props.badge !== false && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`LLM calls: ${summary(totals)}. Open list`}
            onPress={() => setOpen(true)}
            style={[styles.badge, totals.errors > 0 && styles.badgeError]}
          >
            <Text style={styles.badgeText}>🤖 {summary(totals)}</Text>
          </Pressable>
          <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
            <SafeAreaView style={styles.panel}>
              <View style={styles.header}>
                <Text style={styles.title}>LLM calls</Text>
                <Pressable accessibilityRole="button" onPress={() => setOpen(false)} hitSlop={12}>
                  <Text style={styles.link}>Close</Text>
                </Pressable>
              </View>
              <LlmLensPanel calls={calls} />
            </SafeAreaView>
          </Modal>
        </>
      )}
    </>
  );
}

/** The call list, also used as the dev-dock tab. */
export function LlmLensPanel({ calls: given }: { calls?: LlmCall[] }) {
  const live = useCalls();
  const calls = given ?? live;
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <Text style={styles.muted}>{summary(llmLens.totals())}</Text>
        <Pressable accessibilityRole="button" onPress={llmLens.clear} hitSlop={12}>
          <Text style={styles.link}>Clear</Text>
        </Pressable>
      </View>
      {calls.length === 0 && <Text style={styles.muted}>No LLM calls yet.</Text>}
      {calls.map((call) => (
        <Pressable
          key={call.id}
          accessibilityRole="button"
          accessibilityState={{ expanded: expanded === call.id }}
          onPress={() => setExpanded(expanded === call.id ? null : call.id)}
          style={styles.call}
        >
          <Text style={call.error || (call.status ?? 200) >= 400 ? styles.error : undefined}>
            {describeCall(call)}
          </Text>
          {expanded === call.id && (
            <View style={styles.details}>
              <Text style={styles.muted}>{call.url}</Text>
              {call.stopReason && <Text>Stop: {call.stopReason}</Text>}
              {call.error && <Text style={styles.error}>Error: {call.error}</Text>}
              {call.prompt && <Text>Prompt: {call.prompt}</Text>}
              {call.response && <Text>Reply: {call.response}</Text>}
            </View>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Tab for `@helder-studio/dev-dock`. Render `<LlmLens enabled badge={false} />` for recording. */
export const llmLensTab = {
  id: 'llm-lens',
  title: 'LLM',
  status: () => {
    const totals = llmLens.totals();
    return totals.calls ? `🤖 ${summary(totals)}` : null;
  },
  subscribe: llmLens.subscribe,
  render: () => <LlmLensPanel />,
};

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    left: 12,
    bottom: 48,
    zIndex: 9999,
    elevation: 9999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#0b57d0',
  },
  badgeError: { backgroundColor: '#d93025' },
  badgeText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  panel: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  title: { fontSize: 18, fontWeight: '600' },
  link: { color: '#1a73e8', fontWeight: '600' },
  content: { padding: 16, gap: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 40,
  },
  call: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#dadce0',
  },
  details: { marginTop: 6, gap: 4 },
  muted: { color: '#5f6368', fontSize: 12 },
  error: { color: '#d93025' },
});
