import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Check, X, ChevronDown, ChevronUp, Sparkles, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface AIClassification {
  category: string;
  severity: 'P1' | 'P2' | 'P3';
  likely_cause: string;
  confidence: number;
  reasoning: string;
}

export const INCIDENT_CATEGORIES = [
  { value: 'DOCUMENTATION_ISSUE', label: 'Documentation Issue' },
  { value: 'CUSTOMS_DELAY', label: 'Customs Delay' },
  { value: 'CARRIER_DELAY', label: 'Carrier Delay' },
  { value: 'DAMAGE_LOSS', label: 'Damage/Loss' },
  { value: 'ADDRESS_ISSUE', label: 'Address Issue' },
  { value: 'WEATHER_DELAY', label: 'Weather Delay' },
  { value: 'PORT_CONGESTION', label: 'Port Congestion' },
  { value: 'PAYMENT_ISSUE', label: 'Payment Issue' },
  { value: 'CLIENT_REQUEST', label: 'Client Request' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const LIKELY_CAUSES = [
  { value: 'docs', label: 'Documentation' },
  { value: 'carrier', label: 'Carrier' },
  { value: 'customs', label: 'Customs' },
  { value: 'client', label: 'Client' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'weather', label: 'Weather' },
  { value: 'other', label: 'Other' },
] as const;

interface AIClassificationSuggestionProps {
  classification: AIClassification | null;
  isLoading: boolean;
  error: string | null;
  onAccept: (classification: AIClassification) => void;
  onDismiss: () => void;
  hasText: boolean;
  autoMode?: boolean;
}

export function AIClassificationSuggestion({
  classification,
  isLoading,
  error,
  onAccept,
  onDismiss,
  hasText,
  autoMode = true,
}: AIClassificationSuggestionProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);
  const [editedClassification, setEditedClassification] = useState<AIClassification | null>(null);

  const currentClassification = editedClassification || classification;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'P1': return 'bg-destructive text-destructive-foreground';
      case 'P2': return 'bg-orange-500 text-white';
      case 'P3': return 'bg-yellow-500 text-black';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-orange-600';
  };

  const handleEdit = (field: keyof AIClassification, value: string) => {
    const updated = { 
      ...(currentClassification || { 
        category: 'OTHER', 
        severity: 'P3' as const, 
        likely_cause: 'other', 
        confidence: 0.5, 
        reasoning: '' 
      }), 
      [field]: value 
    };
    setEditedClassification(updated);
  };

  const handleAccept = () => {
    if (currentClassification) {
      onAccept(currentClassification);
    }
  };

  // In auto mode, show hint when waiting for text; otherwise show nothing
  if (!classification && !isLoading && !error) {
    if (autoMode && hasText) {
      // Auto mode: show subtle hint that AI is ready
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-4"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 px-3 bg-muted/30 rounded-lg">
            <Sparkles className="w-3 h-3" />
            <span>{t('classification.autoAnalyzing', 'AI will analyze when you finish typing...')}</span>
          </div>
        </motion.div>
      );
    }
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      {isLoading && (
        <motion.div
          key="loading"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-4"
        >
          <Card className="p-4 border-primary/30 bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Bot className="w-5 h-5 text-primary animate-pulse" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-primary">
                  {t('classification.analyzing', 'Analyzing incident...')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('classification.aiProcessing', 'AI is processing your text')}
                </p>
              </div>
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          </Card>
        </motion.div>
      )}

      {error && (
        <motion.div
          key="error"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-4"
        >
          <Card className="p-4 border-destructive/30 bg-destructive/5">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <p className="text-sm text-destructive flex-1">{error}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDismiss}
              >
                {t('common.close', 'Close')}
              </Button>
            </div>
          </Card>
        </motion.div>
      )}

      {classification && !isLoading && (
        <motion.div
          key="classification"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-4"
        >
          <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent overflow-hidden">
            {/* Header */}
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-primary/5 transition-colors"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-full bg-primary/10">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-medium">
                  {t('classification.aiSuggestion', 'AI Suggestion')}
                </span>
                <Badge 
                  variant="outline" 
                  className={cn("text-xs", getConfidenceColor(classification.confidence))}
                >
                  {Math.round(classification.confidence * 100)}% {t('classification.confidence', 'confidence')}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={cn("text-xs", getSeverityColor(currentClassification?.severity || 'P3'))}>
                  {currentClassification?.severity}
                </Badge>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Expanded Content */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="px-3 pb-3 space-y-3">
                    {/* Classification Fields */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          {t('classification.category', 'Category')}
                        </label>
                        <Select
                          value={currentClassification?.category}
                          onValueChange={(v) => handleEdit('category', v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INCIDENT_CATEGORIES.map((cat) => (
                              <SelectItem key={cat.value} value={cat.value} className="text-xs">
                                {cat.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          {t('classification.severity', 'Severity')}
                        </label>
                        <Select
                          value={currentClassification?.severity}
                          onValueChange={(v) => handleEdit('severity', v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="P1" className="text-xs">P1 - Critical</SelectItem>
                            <SelectItem value="P2" className="text-xs">P2 - High</SelectItem>
                            <SelectItem value="P3" className="text-xs">P3 - Medium</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                          {t('classification.cause', 'Likely Cause')}
                        </label>
                        <Select
                          value={currentClassification?.likely_cause}
                          onValueChange={(v) => handleEdit('likely_cause', v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LIKELY_CAUSES.map((cause) => (
                              <SelectItem key={cause.value} value={cause.value} className="text-xs">
                                {cause.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Reasoning */}
                    {classification.reasoning && (
                      <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                        <span className="font-medium">{t('classification.reasoning', 'Reasoning')}:</span>{' '}
                        {classification.reasoning}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAccept}
                        className="flex-1 h-8"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        {editedClassification 
                          ? t('classification.applyChanges', 'Apply Changes')
                          : t('classification.accept', 'Accept')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onDismiss}
                        className="h-8"
                      >
                        <X className="w-3 h-3 mr-1" />
                        {t('classification.dismiss', 'Dismiss')}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
