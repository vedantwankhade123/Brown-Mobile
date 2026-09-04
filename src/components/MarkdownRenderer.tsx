import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { CopyIcon, CheckIcon } from './Icons';

const Linking = require('react-native').Linking;

interface MarkdownRendererProps {
  content: string;
  onCopyText?: (text: string) => void;
}

type ListKind = 'ul' | 'ol' | 'task';

interface ListItem {
  text: string;
  checked?: boolean;
  indent: number;
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(line);
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableStart(lines: string[], index: number): boolean {
  if (index + 1 >= lines.length) return false;
  const header = lines[index];
  const sep = lines[index + 1];
  if (!header.includes('|') || !isTableSeparator(sep)) return false;
  return splitTableRow(header).length > 0;
}

/** Recursive inline markdown: bold, italic, strike, code, links */
function renderInline(text: string, keyPrefix = 'i'): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern =
    /(`[^`]+`|\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|\*[^*\n]+?\*|_[^_\n]+?_|\[([^\]]+)\]\(([^)]+)\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let part = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Text key={`${keyPrefix}-t-${part++}`}>{text.slice(lastIndex, match.index)}</Text>
      );
    }

    const token = match[0];
    const key = `${keyPrefix}-m-${part++}`;

    if (token.startsWith('`')) {
      nodes.push(
        <Text key={key} style={styles.inlineCode}>
          {token.slice(1, -1)}
        </Text>
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(
        <Text key={key} style={styles.boldText}>
          {renderInline(token.slice(2, -2), key)}
        </Text>
      );
    } else if (token.startsWith('~~')) {
      nodes.push(
        <Text key={key} style={styles.strikeText}>
          {renderInline(token.slice(2, -2), key)}
        </Text>
      );
    } else if (token.startsWith('*') || token.startsWith('_')) {
      nodes.push(
        <Text key={key} style={styles.italicText}>
          {renderInline(token.slice(1, -1), key)}
        </Text>
      );
    } else if (token.startsWith('[')) {
      const label = match[2] || '';
      const url = match[3] || '';
      nodes.push(
        <Text
          key={key}
          style={styles.linkText}
          onPress={() => {
            if (url) Linking.openURL(url).catch(() => undefined);
          }}
        >
          {label}
        </Text>
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(<Text key={`${keyPrefix}-t-end`}>{text.slice(lastIndex)}</Text>);
  }

  if (nodes.length === 0) {
    return [<Text key={`${keyPrefix}-empty`}>{text}</Text>];
  }

  return nodes;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onCopyText,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyCode = (code: string, index: number) => {
    setCopiedIndex(index);
    onCopyText?.(code);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const blocks = useMemo(() => {
    const out: React.ReactNode[] = [];
    const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');

    let inCodeBlock = false;
    let codeLanguage = '';
    let codeBuffer: string[] = [];
    let codeBlockIndex = 0;

    let listItems: ListItem[] = [];
    let listKind: ListKind = 'ul';

    const flushList = (key: string) => {
      if (listItems.length === 0) return;
      const items = listItems;
      const kind = listKind;
      listItems = [];

      out.push(
        <View key={`list-${key}`} style={styles.listContainer}>
          {items.map((item, idx) => {
            const pad = Math.min(item.indent, 3) * 14;
            let marker: React.ReactNode;
            if (kind === 'ol') {
              marker = <Text style={styles.listBullet}>{`${idx + 1}.`}</Text>;
            } else if (kind === 'task') {
              marker = (
                <View style={[styles.taskBox, item.checked && styles.taskBoxChecked]}>
                  {item.checked ? <Text style={styles.taskCheck}>✓</Text> : null}
                </View>
              );
            } else {
              marker = <Text style={styles.listBullet}>{item.indent > 0 ? '◦' : '•'}</Text>;
            }

            return (
              <View key={idx} style={[styles.listItemRow, { paddingLeft: pad }]}>
                <View style={styles.listMarkerWrap}>{marker}</View>
                <Text style={styles.listText}>{renderInline(item.text, `li-${key}-${idx}`)}</Text>
              </View>
            );
          })}
        </View>
      );
    };

    const pushTable = (startIndex: number): number => {
      const headerCells = splitTableRow(lines[startIndex]);
      let i = startIndex + 2; // skip separator
      const rows: string[][] = [];

      while (i < lines.length) {
        const row = lines[i];
        if (!row.includes('|') || row.trim().startsWith('```')) break;
        if (!row.trim()) break;
        // stop if next block type
        if (/^#{1,6}\s/.test(row) || /^>\s?/.test(row)) break;
        if (/^(\s*)([-*+]|\d+\.)\s+/.test(row) && !row.includes('|')) break;
        rows.push(splitTableRow(row));
        i += 1;
      }

      const colCount = Math.max(
        headerCells.length,
        ...rows.map((r) => r.length),
        1
      );
      const normalize = (cells: string[]) => {
        const next = [...cells];
        while (next.length < colCount) next.push('');
        return next.slice(0, colCount);
      };

      const header = normalize(headerCells);
      const body = rows.map(normalize);
      const minColWidth = Math.max(88, Math.min(140, Math.floor(280 / colCount)));

      out.push(
        <ScrollView
          key={`table-${startIndex}`}
          horizontal
          showsHorizontalScrollIndicator
          style={styles.tableScroll}
          contentContainerStyle={styles.tableScrollContent}
        >
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeaderRow]}>
              {header.map((cell, cIdx) => (
                <View
                  key={`th-${cIdx}`}
                  style={[
                    styles.tableCell,
                    styles.tableHeaderCell,
                    { minWidth: minColWidth, maxWidth: 220 },
                    cIdx === colCount - 1 && styles.tableCellLast,
                  ]}
                >
                  <Text style={styles.tableHeaderText}>{renderInline(cell, `th-${startIndex}-${cIdx}`)}</Text>
                </View>
              ))}
            </View>
            {body.map((row, rIdx) => (
              <View
                key={`tr-${rIdx}`}
                style={[styles.tableRow, rIdx % 2 === 1 && styles.tableRowAlt]}
              >
                {row.map((cell, cIdx) => (
                  <View
                    key={`td-${rIdx}-${cIdx}`}
                    style={[
                      styles.tableCell,
                      { minWidth: minColWidth, maxWidth: 220 },
                      cIdx === colCount - 1 && styles.tableCellLast,
                      rIdx === body.length - 1 && styles.tableCellBottom,
                    ]}
                  >
                    <Text style={styles.tableCellText}>{renderInline(cell, `td-${startIndex}-${rIdx}-${cIdx}`)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );

      return i - 1;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Fenced code blocks
      if (trimmed.startsWith('```')) {
        if (inCodeBlock) {
          const codeContent = codeBuffer.join('\n');
          const currIndex = codeBlockIndex++;
          const isCopied = copiedIndex === currIndex;

          out.push(
            <View key={`code-${i}`} style={styles.codeBlockWrapper}>
              <View style={styles.codeHeader}>
                <Text style={styles.codeLangText}>
                  {codeLanguage ? codeLanguage.toUpperCase() : 'CODE'}
                </Text>
                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={() => handleCopyCode(codeContent, currIndex)}
                  activeOpacity={0.7}
                >
                  <View style={styles.copiedRow}>
                    {isCopied ? (
                      <>
                        <CheckIcon size={12} color={colors.success} />
                        <Text style={[styles.copyBtnText, { color: colors.success }]}>COPIED</Text>
                      </>
                    ) : (
                      <>
                        <CopyIcon size={12} color={colors.textSecondary} />
                        <Text style={styles.copyBtnText}>COPY</Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={styles.codeText}>{codeContent || ' '}</Text>
              </ScrollView>
            </View>
          );

          codeBuffer = [];
          codeLanguage = '';
          inCodeBlock = false;
        } else {
          flushList(`flush-${i}`);
          inCodeBlock = true;
          codeLanguage = trimmed.slice(3).trim();
        }
        continue;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        continue;
      }

      // Tables
      if (isTableStart(lines, i)) {
        flushList(`before-table-${i}`);
        i = pushTable(i);
        continue;
      }

      // Lists / task lists
      const taskMatch = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
      const bulletMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
      const numberMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);

      if (taskMatch) {
        const indent = Math.floor((taskMatch[1] || '').length / 2);
        if (listItems.length > 0 && listKind !== 'task') flushList(`switch-${i}`);
        listKind = 'task';
        listItems.push({
          text: taskMatch[3],
          checked: taskMatch[2].toLowerCase() === 'x',
          indent,
        });
        continue;
      }

      if (bulletMatch) {
        const indent = Math.floor((bulletMatch[1] || '').length / 2);
        if (listItems.length > 0 && listKind !== 'ul') flushList(`switch-${i}`);
        listKind = 'ul';
        listItems.push({ text: bulletMatch[2], indent });
        continue;
      }

      if (numberMatch) {
        const indent = Math.floor((numberMatch[1] || '').length / 2);
        if (listItems.length > 0 && listKind !== 'ol') flushList(`switch-${i}`);
        listKind = 'ol';
        listItems.push({ text: numberMatch[2], indent });
        continue;
      }

      flushList(`before-${i}`);

      // Headings
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const style =
          level === 1
            ? styles.h1
            : level === 2
            ? styles.h2
            : level === 3
            ? styles.h3
            : styles.h4;
        out.push(
          <Text key={`h-${i}`} style={style}>
            {renderInline(headingMatch[2], `h-${i}`)}
          </Text>
        );
        continue;
      }

      // Multi-line blockquotes
      if (trimmed.startsWith('>')) {
        const quoteLines: string[] = [];
        let j = i;
        while (j < lines.length && lines[j].trim().startsWith('>')) {
          quoteLines.push(lines[j].trim().replace(/^>\s?/, ''));
          j += 1;
        }
        out.push(
          <View key={`quote-${i}`} style={styles.blockquote}>
            <Text style={styles.blockquoteText}>
              {renderInline(quoteLines.join('\n'), `q-${i}`)}
            </Text>
          </View>
        );
        i = j - 1;
        continue;
      }

      // Horizontal rule
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        out.push(<View key={`hr-${i}`} style={styles.hr} />);
        continue;
      }

      // Paragraph (merge consecutive non-empty lines lightly)
      if (trimmed.length > 0) {
        out.push(
          <Text key={`p-${i}`} style={styles.paragraph}>
            {renderInline(line, `p-${i}`)}
          </Text>
        );
      } else {
        out.push(<View key={`space-${i}`} style={styles.paragraphGap} />);
      }
    }

    flushList('final');

    // Unclosed code fence
    if (inCodeBlock && codeBuffer.length > 0) {
      out.push(
        <View key="code-unclosed" style={styles.codeBlockWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text style={styles.codeText}>{codeBuffer.join('\n')}</Text>
          </ScrollView>
        </View>
      );
    }

    return out;
  }, [content, copiedIndex]);

  if (!content) return null;

  return <View style={styles.container}>{blocks}</View>;
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  paragraph: {
    color: '#ececf1',
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 8,
    letterSpacing: 0.1,
  },
  paragraphGap: {
    height: 8,
  },
  h1: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: 14,
    marginBottom: 10,
    lineHeight: 32,
  },
  h2: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginTop: 14,
    marginBottom: 8,
    lineHeight: 28,
  },
  h3: {
    color: '#f4f4f5',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
    lineHeight: 24,
  },
  h4: {
    color: '#e4e4e7',
    fontSize: 15.5,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
    lineHeight: 22,
  },
  boldText: {
    fontWeight: '700',
    color: '#ffffff',
  },
  italicText: {
    fontStyle: 'italic',
    color: '#d4d4d8',
  },
  strikeText: {
    textDecorationLine: 'line-through',
    color: '#a1a1aa',
  },
  linkText: {
    color: '#60a5fa',
    textDecorationLine: 'underline',
  },
  inlineCode: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#f9a8d4',
    fontFamily: typography.fontFamily.mono,
    fontSize: 13.5,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    overflow: 'hidden',
  },
  codeBlockWrapper: {
    backgroundColor: '#0d0d0f',
    borderRadius: 12,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#161618',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  codeLangText: {
    color: '#a1a1aa',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  copyBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 9999,
  },
  copiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copyBtnText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  codeText: {
    color: '#e5e7eb',
    fontFamily: typography.fontFamily.mono,
    fontSize: 13,
    lineHeight: 20,
    padding: 12,
  },
  listContainer: {
    marginVertical: 6,
    paddingLeft: 2,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  listMarkerWrap: {
    width: 22,
    marginTop: 2,
    marginRight: 6,
    alignItems: 'center',
  },
  listBullet: {
    color: '#a1a1aa',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  listText: {
    flex: 1,
    color: '#ececf1',
    fontSize: 16,
    lineHeight: 26,
  },
  taskBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#71717a',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  taskBoxChecked: {
    backgroundColor: '#22c55e',
    borderColor: '#22c55e',
  },
  taskCheck: {
    color: '#052e16',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 8,
    borderRadius: 8,
  },
  blockquoteText: {
    color: '#d4d4d8',
    fontSize: 15,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  hr: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    marginVertical: 16,
  },
  tableScroll: {
    marginVertical: 10,
    maxWidth: '100%',
  },
  tableScrollContent: {
    paddingRight: 8,
  },
  table: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#111113',
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableHeaderRow: {
    backgroundColor: '#1c1c1f',
  },
  tableRowAlt: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  tableCell: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
  },
  tableHeaderCell: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.16)',
  },
  tableCellLast: {
    borderRightWidth: 0,
  },
  tableCellBottom: {
    borderBottomWidth: 0,
  },
  tableHeaderText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  tableCellText: {
    color: '#e4e4e7',
    fontSize: 13.5,
    lineHeight: 19,
  },
});
