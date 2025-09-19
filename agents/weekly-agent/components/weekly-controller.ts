import { Component } from '@astack-tech/core';

/**
 * 周刊生成网关组件
 * 
 * 作为流水线的统一入口和出口，控制整个流程的时序
 * 
 */
export class WeeklyControllerComponent extends Component {
  constructor() {
    super({});

    // 定义输入和输出端口
    Component.Port.I('input').attach(this);             // 统一输入入口
    Component.Port.I('newsletterGenerated').attach(this); // 周刊生成完成信号
    
    Component.Port.O('triggerScrape').attach(this);     // 触发爬虫启动
    Component.Port.O('out').attach(this);               // 最终输出
  }

  /**
   * 组件转换方法
   */
  _transform($i: any, $o: any) {
    console.log('📋 WeeklyController Gateway 初始化');

    // 接收统一输入
    $i('input').receive((data: any) => {
      console.log('🎯 WeeklyController 接收输入，开始流程...', data);
      
      // 直接触发爬虫启动
      $o('triggerScrape').send(true);
      console.log('📡 已发送爬虫启动触发信号');
    });

    // 接收周刊生成完成信号
    $i('newsletterGenerated').receive((result: any) => {
      console.log('✅ WeeklyController 接收到周刊生成完成信号');
      
      // 发送最终结果到 out 端口（这是 Pipeline 的终点）
      $o('out').send(result);
      console.log('🎉 流程完成，发送最终结果到 out 端口');
    });
  }
}

export default WeeklyControllerComponent;