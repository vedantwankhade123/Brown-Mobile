import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { typography, spacing, borderRadius } from '../theme/typography';
import { CopyIcon, CheckIcon } from './Icons';

interface MarkdownRendererProps {
  content: string;
  onCopyText?: (text: string) => void;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onCopyText,
}) => {
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  const handleCopyCode = (code: string, index: number) => {
    setCopiedIndex(index);
    if (onCopyText) {
      onCopyText(code);
    } else {
      Alert.alert('Copied', 'Code block copied to clipboard');
    }
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Parse lines and blocks into structured AST
  const renderBlocks = () => {
    const blocks: React.ReactNode[] = [];
    const lines = content.split('\n');

    let inCodeBlock = false;
    let codeLanguage = '';
    let codeBuffer: string[] = [];
    let codeBlockIndex = 0;

    let listBuffer: string[] = [];
    let isNumberedList = false;

    const flushList = (key: string) => {
      if (listBuffer.length > 0) {
        blocks.push(
          <View key={`list-${key}`} style={styles.listContainer}>
            {listBuffer.map((item, idx) => (
              <View key={idx} style={styles.listItemRow}>
                <Text style={styles.listBullet}>
                  {isNumberedList ? `${idx + 1}.` : '•'}
                </Text>
                <Text style={styles.listText}>{renderInline(item)}</Text>
              </View>
            ))}
          </View>
        );
        listBuffer = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code block start / end
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          // Finish code block
          const codeContent = codeBuffer.join('\n');
          const currIndex = codeBlockIndex++;
          const isCopied = copiedIndex === currIndex;

          blocks.push(
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
                  {isCopied ? (
                    <View style={styles.copiedRow}>
                      <CheckIcon size={12} color={colors.success} />
                      <Text style={[styles.copyBtnText, { color: colors.success }]}>
                        COPIED
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.copiedRow}>
                      <CopyIcon size={12} color={colors.textSecondary} />
                      <Text style={styles.copyBtnText}>COPY</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={styles.codeText}>{codeContent}</Text>
              </ScrollView>
            </View>
          );

          codeBuffer = [];
          codeLanguage = '';
          inCodeBlock = false;
        } else {
          flushList(`flush-${i}`);
          inCodeBlock = true;
          codeLanguage = line.trim().slice(3).trim();
        }
        continue;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        continue;
      }

      // Check for Lists
      const bulletMatch = line.match(/^(\s*)[-*+]\s+(.*)/);
      const numberMatch = line.match(/^(\s*)\d+\.\s+(.*)/);

      if (bulletMatch) {
        isNumberedList = false;
        listBuffer.push(bulletMatch[2]);
        continue;
      } else if (numberMatch) {
        isNumberedList = true;
        listBuffer.push(numberMatch[2]);
        continue;
      } else {
        flushList(`before-${i}`);
      }

      // Headings
      if (line.startsWith('# ')) {
        blocks.push(
          <Text key={`h1-${i}`} style={styles.h1}>
            {renderInline(line.slice(2))}
          </Text>
        );
        continue;
      }
      if (line.startsWith('## ')) {
        blocks.push(
          <Text key={`h2-${i}`} style={styles.h2}>
            {renderInline(line.slice(3))}
          </Text>
        );
        continue;
      }
      if (line.startsWith('### ')) {
        blocks.push(
          <Text key={`h3-${i}`} style={styles.h3}>
            {renderInline(line.slice(4))}
          </Text>
        );
        continue;
      }

      // Blockquotes
      if (line.startsWith('> ')) {
        blocks.push(
          <View key={`quote-${i}`} style={styles.blockquote}>
            <Text style={styles.blockquoteText}>{renderInline(line.slice(2))}</Text>
          </View>
        );
        continue;
      }

      // Horizontal rule
      if (line.trim() === '---' || line.trim() === '***') {
        blocks.push(<View key={`hr-${i}`} style={styles.hr} />);
        continue;
      }

      // Standard Paragraph
      if (line.trim().length > 0) {
        blocks.push(
          <Text key={`p-${i}`} style={styles.paragraph}>
            {renderInline(line)}
          </Text>
        );
      } else {
        // Line spacing
        blocks.push(<View key={`space-${i}`} style={{ height: 6 }} />);
      }
    }

    flushList('final');
    return blocks;
  };

  // Inline formatting parser (Bold, Italic, Inline Code)
  const renderInline = (text: string): React.ReactNode => {
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);

    return parts.map((part, index) => {
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return (
          <Text key={index} style={styles.inlineCode}>
            {part.slice(1, -1)}
          </Text>
        );
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <Text key={index} style={styles.boldText}>
            {part.slice(2, -2)}
          </Text>
        );
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
        return (
          <Text key={index} style={styles.italicText}>
            {part.slice(1, -1)}
          </Text>
        );
      }
      return <Text key={index}>{part}</Text>;
    });
  };

  return <View style={styles.container}>{renderBlocks()}</View>;
};

// Internal minimal horizontal scroll view helper
const ScrollView: React.FC<any> = require('react-native').ScrollView;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  paragraph: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    marginBottom: 4,
  },
  h1: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  h2: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  h3: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: '700',
    marginTop: spacing.xs,
    marginBottom: 4,
  },
  boldText: {
    fontWeight: '700',
    color: colors.accentWhite,
  },
  italicText: {
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  inlineCode: {
    backgroundColor: colors.surfaceActive,
    color: '#E5E7EB',
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.fontSize.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  codeBlockWrapper: {
    backgroundColor: colors.codeBackground,
    borderRadius: borderRadius.md,
    marginVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  codeLangText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
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
    color: '#F3F4F6',
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.fontSize.xs,
    lineHeight: 19,
    padding: spacing.sm,
  },
  listContainer: {
    marginVertical: 4,
    paddingLeft: 4,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 3,
  },
  listBullet: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: typography.lineHeight.md,
    marginRight: spacing.sm,
    width: 14,
  },
  listText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.borderHighlight,
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginVertical: 4,
    borderRadius: borderRadius.sm,
  },
  blockquoteText: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontStyle: 'italic',
  },
  hr: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing.md,
  },
});
