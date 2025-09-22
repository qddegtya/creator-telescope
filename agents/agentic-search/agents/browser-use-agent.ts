/**
 * Browser Use Agent - 通用浏览器自动化代理
 * 基于AStack框架设计，参考Chrome Extension架构
 * 实现智能页面分析和精确交互
 */

import { Component } from '@astack-tech/core';
import { Agent, AgentConfig } from '@astack-tech/components';
import { createTool } from '@astack-tech/tools';
import type { Page } from 'playwright';
import type { ModelProvider } from '@astack-tech/components';

// 页面元素接口
export interface PageElement {
  ref: string;
  type: string;
  role: string;
  text: string;
  isVisible: boolean;
  isClickable: boolean;
  coordinates: { x: number; y: number };
  boundingBox: { x: number; y: number; width: number; height: number };
  attributes: Record<string, string>;
}

// Browser Use Agent配置
interface BrowserUseAgentConfig {
  modelProvider: ModelProvider;
}

/**
 * Browser Use Agent - AStack组件
 * 实现通用浏览器自动化和页面分析
 */
export class BrowserUseAgent extends Component {
  private agent: Agent;
  private currentPage: Page | null = null;

  constructor({ modelProvider }: BrowserUseAgentConfig) {
    super({});

    // 配置端口
    Component.Port.I('task').attach(this);
    Component.Port.O('result').attach(this);

    // 初始化Agent
    this.agent = new Agent({
      model: modelProvider,
      systemPrompt: this.getSystemPrompt(),
      tools: this.getBrowserUseTools(),
      maxIterations: 20,
    } as AgentConfig);
  }

  _transform($i: any, $o: any) {
    // 处理任务输入
    $i('task').receive(async (taskInput: any) => {
      try {
        const task = typeof taskInput === 'object' && taskInput.raw ? taskInput.raw : String(taskInput);
        const context = taskInput.context || {};

        console.log(`🌐 Browser Use Agent processing: ${task}`);

        // 确保有页面上下文并设置到实例变量
        if (!context.page) {
          $o('result').send({
            success: false,
            error: 'Browser Use Agent requires a Playwright page context'
          });
          return;
        }

        // 设置当前页面到实例变量，供工具使用
        this.currentPage = context.page;

        // 创建Agent输入
        const input = {
          messages: [{
            role: 'user',
            content: task
          }]
        };

        // 执行Agent
        const result = await this.agent.run(input);

        $o('result').send({
          success: true,
          ...result
        });

      } catch (error: any) {
        console.error('🚨 Browser Use Agent error:', error);
        $o('result').send({
          success: false,
          error: error.message
        });
      }
    });
  }

  /**
   * Browser Use 工具集
   */
  private getBrowserUseTools() {
    const self = this; // 保存this引用
    return [
      createTool(
        'get_page_snapshot',
        'Capture page screenshot and extract all interactive elements with visual annotations',
        async (args: Record<string, unknown>) => {
          const page = self.currentPage;
          
          if (!page) {
            throw new Error('Page context is not available');
          }
          
          // 1. 基础页面信息
          const url = page.url();
          const title = await page.title();
          const viewport = page.viewportSize() || { width: 1366, height: 768 };

          // 2. 截图
          const screenshot = await page.screenshot({ 
            type: 'png',
            fullPage: false
          });
          const screenshotBase64 = screenshot.toString('base64');

          // 3. 提取交互元素 - 参考Chrome Extension实现
          const elements = await self.extractInteractiveElements(page);

          console.log(`📊 Page Snapshot: ${elements.length} interactive elements found`);

          return {
            url,
            title,
            screenshot: screenshotBase64,
            elements,
            viewport,
            message: `Captured page snapshot with ${elements.length} interactive elements`
          };
        },
        {
          type: 'object',
          properties: {},
          required: []
        }
      ),

      createTool(
        'click_element',
        'Click on a page element using coordinates or selector',
        async (args: Record<string, unknown>) => {
          const page = self.currentPage;
          const x = args.x as number;
          const y = args.y as number;
          const selector = args.selector as string;

          if (!page) {
            throw new Error('Page context is not available');
          }

          try {
            if (x !== undefined && y !== undefined) {
              // 使用坐标点击
              await page.mouse.click(x, y);
              return `Successfully clicked at coordinates (${x}, ${y})`;
            } else if (selector) {
              // 使用选择器点击
              await page.click(selector);
              return `Successfully clicked element: ${selector}`;
            } else {
              throw new Error('Either coordinates (x, y) or selector must be provided');
            }
          } catch (error: any) {
            throw new Error(`Click failed: ${error.message}`);
          }
        },
        {
          type: 'object',
          properties: {
            x: { type: 'number', description: 'X coordinate to click' },
            y: { type: 'number', description: 'Y coordinate to click' },
            selector: { type: 'string', description: 'CSS selector of element to click' }
          }
        }
      ),

      createTool(
        'type_text',
        'Type text into an input field',
        async (args: Record<string, unknown>) => {
          const page = self.currentPage;
          const text = args.text as string;
          const selector = args.selector as string;

          if (!page) {
            throw new Error('Page context is not available');
          }

          if (!text) throw new Error('Text parameter is required');

          try {
            if (selector) {
              await page.fill(selector, text);
              return `Successfully typed "${text}" into ${selector}`;
            } else {
              // 直接键盘输入（用于焦点已在正确位置时）
              await page.keyboard.type(text);
              return `Successfully typed "${text}"`;
            }
          } catch (error: any) {
            throw new Error(`Type text failed: ${error.message}`);
          }
        },
        {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Text to type' },
            selector: { type: 'string', description: 'CSS selector of input field (optional)' }
          },
          required: ['text']
        }
      ),

      createTool(
        'press_key',
        'Press a keyboard key',
        async (args: Record<string, unknown>) => {
          const page = self.currentPage;
          const key = args.key as string;

          if (!page) {
            throw new Error('Page context is not available');
          }

          if (!key) throw new Error('Key parameter is required');

          try {
            await page.keyboard.press(key);
            return `Successfully pressed key: ${key}`;
          } catch (error: any) {
            throw new Error(`Press key failed: ${error.message}`);
          }
        },
        {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Key to press (e.g., "Enter", "Escape", "ArrowDown")' }
          },
          required: ['key']
        }
      ),

      createTool(
        'navigate_to',
        'Navigate to a specific URL',
        async (args: Record<string, unknown>) => {
          const page = self.currentPage;
          const url = args.url as string;

          if (!page) {
            throw new Error('Page context is not available');
          }

          if (!url) throw new Error('URL parameter is required');

          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            return `Successfully navigated to: ${url}`;
          } catch (error: any) {
            throw new Error(`Navigation failed: ${error.message}`);
          }
        },
        {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to navigate to' }
          },
          required: ['url']
        }
      ),

      createTool(
        'wait_and_retry',
        'Wait for a specified duration and optionally retry an operation',
        async (args: Record<string, unknown>) => {
          const page = self.currentPage;
          const duration = (args.duration as number) || 1000;

          if (!page) {
            throw new Error('Page context is not available');
          }

          await page.waitForTimeout(duration);
          return `Waited ${duration}ms`;
        },
        {
          type: 'object',
          properties: {
            duration: { type: 'number', description: 'Duration to wait in milliseconds (default: 1000)' }
          }
        }
      )
    ];
  }

  /**
   * 提取页面交互元素 - 参考Chrome Extension实现
   */
  private async extractInteractiveElements(page: Page): Promise<PageElement[]> {
    const scriptContent = `
      (function() {
        var elements = [];
        var refCounter = 0;

        // 核心选择器 - 参考Chrome Extension
        var INTERACTIVE_SELECTORS = [
          'a[href]',
          'button:not([disabled])',
          'input:not([disabled])',
          'textarea:not([disabled])',
          'select:not([disabled])',
          '[role="button"]:not([disabled])',
          '[role="link"]',
          '[role="textbox"]',
          '[role="checkbox"]',
          '[role="radio"]',
          '[tabindex]:not([tabindex="-1"])',
          '[onclick]',
          'h1, h2, h3, h4, h5, h6',
          '[data-testid]'
        ];

        // 获取所有匹配元素
        var foundElements = [];
        for (var i = 0; i < INTERACTIVE_SELECTORS.length; i++) {
          try {
            var nodeList = document.querySelectorAll(INTERACTIVE_SELECTORS[i]);
            for (var j = 0; j < nodeList.length; j++) {
              var found = false;
              for (var k = 0; k < foundElements.length; k++) {
                if (foundElements[k] === nodeList[j]) {
                  found = true;
                  break;
                }
              }
              if (!found) {
                foundElements.push(nodeList[j]);
              }
            }
          } catch (e) {
            // 忽略无效选择器
          }
        }

        // 可见性检查函数
        function isElementVisible(element) {
          var style = window.getComputedStyle(element);
          var rect = element.getBoundingClientRect();
          
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 style.opacity !== '0' &&
                 rect.width > 0 && 
                 rect.height > 0 &&
                 rect.top < window.innerHeight &&
                 rect.bottom > 0;
        }

        // 获取元素角色
        function getElementRole(element) {
          var role = element.getAttribute('role');
          if (role) return role;

          var tagName = element.tagName.toLowerCase();
          var type = element.getAttribute('type');

          var roleMap = {
            'a': 'link',
            'button': 'button',
            'input': type === 'submit' || type === 'button' ? 'button' :
                     type === 'checkbox' ? 'checkbox' :
                     type === 'radio' ? 'radio' : 'textbox',
            'textarea': 'textbox',
            'select': 'combobox',
            'h1': 'heading', 'h2': 'heading', 'h3': 'heading',
            'h4': 'heading', 'h5': 'heading', 'h6': 'heading'
          };

          return roleMap[tagName] || 'generic';
        }

        // 获取可访问文本
        function getAccessibleText(element) {
          return element.getAttribute('aria-label') || 
                 element.getAttribute('placeholder') ||
                 element.getAttribute('title') ||
                 element.getAttribute('alt') ||
                 (element.textContent || '').trim().substring(0, 100);
        }

        // 处理每个元素
        for (var idx = 0; idx < foundElements.length; idx++) {
          var element = foundElements[idx];
          if (!isElementVisible(element)) continue;

          var rect = element.getBoundingClientRect();
          
          // 忽略太小的元素
          if (rect.width < 5 || rect.height < 5) continue;

          var ref = 'ref_' + (++refCounter);
          var role = getElementRole(element);
          var text = getAccessibleText(element);
          var tagName = element.tagName.toLowerCase();

          // 判断是否可点击
          var isClickable = (tagName === 'a' || tagName === 'button') ||
                             element.hasAttribute('onclick') ||
                             element.getAttribute('role') === 'button' ||
                             element.getAttribute('role') === 'link';

          elements.push({
            ref: ref,
            type: tagName,
            role: role,
            text: text,
            isVisible: true,
            isClickable: isClickable,
            coordinates: {
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2)
            },
            boundingBox: {
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            attributes: {
              id: element.getAttribute('id') || '',
              class: element.getAttribute('class') || '',
              name: element.getAttribute('name') || '',
              type: element.getAttribute('type') || '',
              href: element.getAttribute('href') || '',
              placeholder: element.getAttribute('placeholder') || '',
              value: element.value || ''
            }
          });

          // 存储元素引用供后续使用
          element.__browserUseRef = ref;
        }

        return elements;
      })();
    `;

    return await page.evaluate(scriptContent);
  }

  /**
   * 系统提示词 - 针对Browser Use优化
   */
  private getSystemPrompt(): string {
    return `You are a Browser Use Agent specialized in web page automation and interaction.

Your capabilities:
1. get_page_snapshot() - Capture page screenshot and extract all interactive elements
2. click_element(x?, y?, selector?) - Click elements using coordinates or selectors  
3. type_text(text, selector?) - Type text into input fields
4. press_key(key) - Press keyboard keys (Enter, Escape, Tab, etc.)
5. navigate_to(url) - Navigate to URLs
6. wait_and_retry(duration?) - Wait for page changes

Strategy for task execution:
1. ALWAYS start with get_page_snapshot() to understand the current page
2. Analyze the returned elements to find relevant interactive elements
3. Use precise coordinates from the snapshot for reliable clicking
4. For login tasks: find username/password fields and login buttons
5. For search tasks: find search inputs and submit buttons
6. Wait appropriately between actions for page loading

Element targeting best practices:
- Use coordinates from get_page_snapshot() for most reliable clicking
- Look for elements with relevant text, placeholder, or attributes
- Prefer elements with higher specificity (data-testid, unique IDs)
- Handle different page states (logged in/out, loaded/loading)

Always explain your actions clearly and handle errors gracefully.`;
  }
}