#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { generateImage, generateImageSchema } from './tools/generate_image.js';
import { editImage, editImageSchema } from './tools/edit_image.js';
import { listImageModels, listImageModelsSchema } from './tools/list_image_models.js';
import { cropImage, cropImageSchema } from './tools/crop_image.js';

async function main(): Promise<void> {
  const config = await loadConfig();

  const server = new McpServer({ name: 'imagegen-mcp', version: '0.1.0' });

  server.registerTool(
    'generate_image',
    {
      description:
        'Generate an image from a text prompt via a configured provider (OpenAI, Stability AI, Replicate, or OpenAI-compatible). Saves to outputPath.',
      inputSchema: generateImageSchema.shape,
    },
    async (raw) => {
      const input = generateImageSchema.parse(raw);
      try {
        const res = await generateImage(config, input);
        return {
          content: [{ type: 'text', text: `Saved ${res.paths.length} image(s): ${res.paths.join(', ')} (provider=${res.provider}, model=${res.model ?? 'default'})` }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
        };
      }
    },
  );

  server.registerTool(
    'edit_image',
    {
      description:
        'Edit / inpaint one or more input images with a text prompt and optional mask. Provider must support image edits (OpenAI gpt-image-1.5 / dall-e-2, Stability inpaint).',
      inputSchema: editImageSchema.shape,
    },
    async (raw) => {
      const input = editImageSchema.parse(raw);
      try {
        const res = await editImage(config, input);
        return {
          content: [{ type: 'text', text: `Saved ${res.paths.length} image(s): ${res.paths.join(', ')} (provider=${res.provider}, model=${res.model ?? 'default'})` }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
        };
      }
    },
  );

  server.registerTool(
    'list_image_models',
    {
      description: 'List image-capable models available on a provider (or across all configured providers if none is specified).',
      inputSchema: listImageModelsSchema.shape,
    },
    async (raw) => {
      const input = listImageModelsSchema.parse(raw);
      try {
        const res = await listImageModels(config, input);
        return {
          content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
        };
      }
    },
  );

  server.registerTool(
    'crop_image',
    {
      description:
        'Crop / resize an image to an exact size using sharp. Modes: cover (centered crop, default), contain (letterbox), fill (stretch). Useful for converting generated 1792x1024 covers into 1792x784 (16:7) etc.',
      inputSchema: cropImageSchema.shape,
    },
    async (raw) => {
      const input = cropImageSchema.parse(raw);
      try {
        const res = await cropImage(input);
        return {
          content: [{ type: 'text', text: `Saved ${res.outputPath} (${res.width}x${res.height}, ${res.format})` }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
        };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('imagegen-mcp started, listening on stdio');
}

main().catch((err) => {
  console.error('imagegen-mcp fatal:', err);
  process.exit(1);
});
