import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getLanguageDirection,
  LANGUAGE_NATIVE_NAMES,
  type SupportedLanguage,
} from '@ramassa/shared/i18n';
import type { KnowledgeBlock, LocalizedKnowledgeBody } from '@ramassa/shared/knowledge';

const TRANSLATED_LANGUAGES = ['es', 'en', 'ar', 'fa'] as const;

export interface KnowledgeBodyEditorProps {
  readonly body: LocalizedKnowledgeBody;
  readonly approvedLanguages: ReadonlySet<SupportedLanguage>;
  readonly stepImageNames: Readonly<Record<number, string>>;
  readonly onSourceChange: (blocks: KnowledgeBlock[]) => void;
  readonly onTranslationChange: (language: SupportedLanguage, blocks: KnowledgeBlock[]) => void;
  readonly onStepImageSelect: (index: number, file: File) => void;
  readonly onApprove: (language: SupportedLanguage) => void;
}

export function KnowledgeBodyEditor(props: KnowledgeBodyEditorProps) {
  const { t } = useTranslation('knowledge');
  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <h2 className="text-base font-semibold">{t('fieldBody')}</h2>
      <KnowledgeLanguageBlocks
        language="ca"
        blocks={props.body.ca}
        canChangeStructure
        stepImageNames={props.stepImageNames}
        onChange={props.onSourceChange}
        onStepImageSelect={props.onStepImageSelect}
      />
      {TRANSLATED_LANGUAGES.flatMap((language) => {
        const blocks = props.body[language];
        if (blocks === undefined) return [];
        return [
          <section key={language} className="flex flex-col gap-3 rounded-lg bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">
                {t('translationBody', { language: LANGUAGE_NATIVE_NAMES[language] })}
              </h3>
              {props.approvedLanguages.has(language) ? (
                <Badge>{t('bodyApproved')}</Badge>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  data-testid={`knowledge-body-approve-${language}`}
                  onClick={() => props.onApprove(language)}
                >
                  {t('approveBody', { language: LANGUAGE_NATIVE_NAMES[language] })}
                </Button>
              )}
            </div>
            <KnowledgeLanguageBlocks
              language={language}
              blocks={blocks}
              canChangeStructure={false}
              stepImageNames={{}}
              onChange={(next) => props.onTranslationChange(language, next)}
              onStepImageSelect={() => undefined}
            />
          </section>,
        ];
      })}
    </section>
  );
}

interface KnowledgeLanguageBlocksProps {
  readonly language: SupportedLanguage;
  readonly blocks: readonly KnowledgeBlock[];
  readonly canChangeStructure: boolean;
  readonly stepImageNames: Readonly<Record<number, string>>;
  readonly onChange: (blocks: KnowledgeBlock[]) => void;
  readonly onStepImageSelect: (index: number, file: File) => void;
}

function KnowledgeLanguageBlocks(props: KnowledgeLanguageBlocksProps) {
  const { t } = useTranslation('knowledge');
  const update = (index: number, block: KnowledgeBlock) =>
    props.onChange(props.blocks.map((current, position) => (position === index ? block : current)));
  const remove = (index: number) =>
    props.onChange(props.blocks.filter((_block, position) => position !== index));
  const add = (type: KnowledgeBlock['type']) =>
    props.onChange([
      ...props.blocks,
      type === 'paragraph'
        ? { type: 'paragraph', text: '' }
        : { type: 'step', title: '', text: '', imageUrl: null, imageAlt: null },
    ]);

  return (
    <div className="flex flex-col gap-3" dir={getLanguageDirection(props.language)}>
      {props.blocks.map((block, index) => (
        <fieldset
          key={`${props.language}-${index}`}
          className="flex flex-col gap-3 rounded-md border p-3"
        >
          <legend className="px-1 text-sm font-medium">
            {block.type === 'paragraph' ? t('paragraphText') : t('stepTitle')}
          </legend>
          {block.type === 'paragraph' ? (
            <Textarea
              data-testid={`knowledge-block-${index}-text-${props.language}`}
              value={block.text}
              onChange={(event) => update(index, { ...block, text: event.target.value })}
            />
          ) : (
            <KnowledgeStepFields
              language={props.language}
              index={index}
              block={block}
              imageName={props.stepImageNames[index]}
              canSelectImage={props.canChangeStructure}
              onChange={(next) => update(index, next)}
              onImageSelect={props.onStepImageSelect}
            />
          )}
          {props.canChangeStructure && props.blocks.length > 1 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => remove(index)}>
              {t('removeBlock')}
            </Button>
          ) : null}
        </fieldset>
      ))}
      {props.canChangeStructure ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="knowledge-add-paragraph"
            onClick={() => add('paragraph')}
          >
            {t('addParagraph')}
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="knowledge-add-step"
            onClick={() => add('step')}
          >
            {t('addStep')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface KnowledgeStepFieldsProps {
  readonly language: SupportedLanguage;
  readonly index: number;
  readonly block: Extract<KnowledgeBlock, { type: 'step' }>;
  readonly imageName: string | undefined;
  readonly canSelectImage: boolean;
  readonly onChange: (block: Extract<KnowledgeBlock, { type: 'step' }>) => void;
  readonly onImageSelect: (index: number, file: File) => void;
}

function KnowledgeStepFields(props: KnowledgeStepFieldsProps) {
  const { t } = useTranslation('knowledge');
  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file !== undefined) props.onImageSelect(props.index, file);
  }
  return (
    <>
      <Input
        data-testid={`knowledge-block-${props.index}-title-${props.language}`}
        aria-label={t('stepTitle')}
        value={props.block.title}
        onChange={(event) => props.onChange({ ...props.block, title: event.target.value })}
      />
      <Textarea
        data-testid={`knowledge-block-${props.index}-text-${props.language}`}
        aria-label={t('stepText')}
        value={props.block.text}
        onChange={(event) => props.onChange({ ...props.block, text: event.target.value })}
      />
      <Input
        data-testid={`knowledge-block-${props.index}-alt-${props.language}`}
        aria-label={t('stepImageAlt')}
        value={props.block.imageAlt ?? ''}
        onChange={(event) =>
          props.onChange({ ...props.block, imageAlt: event.target.value || null })
        }
      />
      {props.canSelectImage ? (
        <label className="flex cursor-pointer flex-col gap-1 text-sm font-medium">
          {t('stepImage')}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            data-testid={`knowledge-block-${props.index}-image`}
            onChange={selectImage}
          />
          {props.imageName === undefined ? null : (
            <span className="text-muted-foreground">{props.imageName}</span>
          )}
        </label>
      ) : null}
    </>
  );
}
