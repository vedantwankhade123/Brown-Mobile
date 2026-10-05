import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Rect, Line, Polyline, Circle, Path } from 'react-native-svg';
import { colors } from '../theme/colors';

type Chart = { type: string; title?: string; labels: string[]; values: number[] };
export function parseMobileChart(source: string): Chart {
  const data = JSON.parse(source);
  if (!['bar', 'line', 'area', 'pie', 'donut', 'doughnut'].includes(data.type)
    || !Array.isArray(data.labels) || !Array.isArray(data.values) || !data.values.length
    || data.values.length > 100 || data.labels.length !== data.values.length
    || data.values.some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v))) throw new Error('Invalid chart data');
  if (['pie', 'donut', 'doughnut'].includes(data.type) && (data.values.some((v: number) => v < 0) || !data.values.some((v: number) => v > 0))) throw new Error('Pie charts need positive totals');
  return data;
}
const palette = ['#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee'];
function ChartView({ source }: { source: string }) {
  const data = parseMobileChart(source);
  const width = Math.max(280, data.values.length * 48), height = 180;
  const min = Math.min(0, ...data.values), max = Math.max(0, ...data.values), range = max - min || 1;
  const y = (v: number) => 12 + (max - v) / range * 150;
  const points = data.values.map((v, i) => `${24 + i * (width - 48) / Math.max(1, data.values.length - 1)},${y(v)}`).join(' ');
  const pie = ['pie', 'donut', 'doughnut'].includes(data.type);
  let angle = -Math.PI / 2;
  const total = data.values.reduce((a, b) => a + b, 0);
  return <>
    {data.title ? <Text style={styles.title}>{data.title}</Text> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel={data.title || 'Chart'}>
      <Svg width={pie ? 280 : width} height={height}>
        {pie ? data.values.map((value, i) => {
          const start = angle; angle += value / total * Math.PI * 2;
          const x1 = 140 + 76 * Math.cos(start), y1 = 90 + 76 * Math.sin(start);
          const x2 = 140 + 76 * Math.cos(angle), y2 = 90 + 76 * Math.sin(angle);
          return value === total ? <Circle key={i} cx={140} cy={90} r={76} fill={palette[i % 6]} /> : <Path key={i} d={`M140,90 L${x1},${y1} A76,76 0 ${value / total > .5 ? 1 : 0},1 ${x2},${y2} Z`} fill={palette[i % 6]} />;
        }) : <>
          <Line x1={8} x2={width - 8} y1={y(0)} y2={y(0)} stroke={colors.textMuted} />
          {data.type === 'bar' ? data.values.map((value, i) => <Rect key={i} x={12 + i * (width - 24) / data.values.length} y={Math.min(y(0), y(value))} width={(width - 24) / data.values.length - 10} height={Math.max(1, Math.abs(y(0) - y(value)))} rx={3} fill={palette[i % 6]} />) : <>
            {data.type === 'area' ? <Polyline points={`24,${y(0)} ${points} ${width - 24},${y(0)}`} fill={palette[0]} fillOpacity={.2} stroke="none" /> : null}
            <Polyline points={points} fill="none" stroke={palette[0]} strokeWidth={3} />
            {data.values.map((v, i) => <Circle key={i} cx={24 + i * (width - 48) / Math.max(1, data.values.length - 1)} cy={y(v)} r={4} fill={palette[0]} />)}
          </>}
        </>}
        {['donut', 'doughnut'].includes(data.type) ? <Circle cx={140} cy={90} r={44} fill={colors.surface} /> : null}
      </Svg>
    </ScrollView>
    {data.values.map((value, i) => <View key={i} style={styles.legend}><View style={[styles.dot, { backgroundColor: palette[i % 6] }]} /><Text style={styles.text}>{String(data.labels[i])}: {value}</Text></View>)}
  </>;
}
function DiagramView({ source }: { source: string }) {
  // Bounded native flowchart subset. Unsupported Mermaid stays inspectable, never guessed.
  if (!/^\s*(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i.test(source)) throw new Error('This diagram needs the desktop Mermaid renderer');
  const labels = new Map<string, string>(), edges: Array<[string, string]> = [];
  const node = /\b([A-Za-z][\w-]*)\s*\["?([^\]\n]+?)"?\]/g;
  let match: RegExpExecArray | null;
  while ((match = node.exec(source))) labels.set(match[1], match[2].replace(/^"|"$/g, ''));
  const normalized = source.replace(node, '$1');
  const edge = /\b([A-Za-z][\w-]*)\s*-->\s*(?:\|[^|]*\|\s*)?([A-Za-z][\w-]*)\b/g;
  while ((match = edge.exec(normalized))) { edges.push([match[1], match[2]]); if (!labels.has(match[1])) labels.set(match[1], match[1]); if (!labels.has(match[2])) labels.set(match[2], match[2]); }
  if (!edges.length || labels.size > 40 || /subgraph|classDef|click\s|-->|\{|\(/.test(normalized.replace(edge, ''))) throw new Error('This diagram uses Mermaid features available on desktop');
  return <View>{edges.map(([from, to], i) => <View key={i} style={styles.edge}><Text style={styles.node}>{labels.get(from)}</Text><Text style={styles.arrow}>↓</Text><Text style={styles.node}>{labels.get(to)}</Text></View>)}</View>;
}
export function AnswerVisual({ language, source, pending = false }: { language: string; source: string; pending?: boolean }) {
  const [showSource, setShowSource] = useState(false);
  if (pending) return <View style={[styles.card, styles.loading]} accessibilityRole="progressbar"><ActivityIndicator color={colors.textPrimary} /><Text style={styles.text}>Generating visuals…</Text></View>;
  let visual: React.ReactNode;
  // Call parsers inside this boundary so malformed model data cannot crash the chat.
  try { visual = language === 'mermaid' ? DiagramView({ source }) : ChartView({ source }); }
  catch (error) { visual = <Text style={styles.text}>{error instanceof Error ? error.message : 'The visual could not be rendered'}. Try simplifying it.</Text>; }
  return <View style={styles.card}>{visual}<TouchableOpacity onPress={() => setShowSource(!showSource)} accessibilityRole="button"><Text style={styles.source}>{showSource ? 'Hide source' : 'View source'}</Text></TouchableOpacity>{showSource ? <ScrollView horizontal><Text style={styles.text}>{source}</Text></ScrollView> : null}</View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginVertical: 8, width: '100%' }, loading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, title: { color: colors.textPrimary, fontFamily: 'Outfit_600SemiBold', fontSize: 16, marginBottom: 10 }, text: { color: colors.textPrimary, fontFamily: 'Outfit_400Regular', fontSize: 14, flexShrink: 1 }, legend: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }, dot: { width: 8, height: 8, borderRadius: 4 }, source: { color: colors.textSecondary, fontSize: 12, paddingTop: 12 }, node: { backgroundColor: colors.surfaceElevated, color: colors.textPrimary, borderRadius: 6, padding: 12, textAlign: 'center', fontFamily: 'Outfit_400Regular' }, arrow: { color: colors.textSecondary, textAlign: 'center', padding: 4 }, edge: { marginBottom: 10 } });
