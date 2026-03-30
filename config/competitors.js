/**
 * 竞品配置 - 医疗器械不良事件监控目标
 * 系统预设竞品（可作为默认值恢复）
 */
const defaultCompetitors = {
  // 胆道镜类产品
  biliary_scope: {
    name: '胆道镜',
    description: '胆道镜相关设备',
    competitors: [
      {
        id: 'spyglass',
        name: 'SpyGlass',
        manufacturer: 'Boston Scientific',
        keywords: ['spyglass', 'spyscope', 'spy ds', 'spyglass discover'],
        deviceClass: 'Class II',
        productCode: 'KMQ'
      },
      {
        id: 'cholangioscope',
        name: '胆道镜系统',
        manufacturer: 'Olympus',
        keywords: ['cholangioscope', 'olympus cholangio', 'biliary scope'],
        deviceClass: 'Class II',
        productCode: 'KMQ'
      },
      {
        id: 'duodenoscope',
        name: '十二指肠镜',
        manufacturer: 'Fujifilm',
        keywords: ['duodenoscope', 'fujifilm duodeno', 'ed scope'],
        deviceClass: 'Class II',
        productCode: 'FGE'
      }
    ]
  },

  // 气管镜类产品
  bronchoscope: {
    name: '气管镜',
    description: '气管镜、支气管镜等呼吸内镜设备',
    competitors: [
      {
        id: 'ambu_ascope',
        name: 'Ambu® aScope™ 4',
        manufacturer: 'Ambu',
        keywords: ['ascope 4', 'ambu bronchoscope', 'disposable bronchoscope'],
        deviceClass: 'Class II',
        productCode: 'KMQ'
      }
    ]
  },

  // 泌尿镜类产品
  urology_scope: {
    name: '泌尿镜',
    description: '输尿管镜、膀胱镜等泌尿内镜设备',
    competitors: []
  },

  // 图像处理器类产品
  image_processor: {
    name: '图像处理器',
    description: '内镜图像处理系统及工作站',
    competitors: []
  }
};

// 分类列表
const categories = [
  { id: 'biliary_scope', name: '胆道镜', description: '胆道镜相关设备' },
  { id: 'bronchoscope', name: '气管镜', description: '气管镜、支气管镜等呼吸内镜设备' },
  { id: 'urology_scope', name: '泌尿镜', description: '输尿管镜、膀胱镜等泌尿内镜设备' },
  { id: 'image_processor', name: '图像处理器', description: '内镜图像处理系统及工作站' }
];

module.exports = {
  // 导出默认配置（用于重置）
  defaultCompetitors,
  
  // 导出分类列表
  categories,
  
  // 获取所有分类
  getCategories() {
    return categories;
  },
  
  // 获取默认竞品列表（扁平化）
  getDefaultCompetitors() {
    const all = [];
    Object.entries(defaultCompetitors).forEach(([catId, category]) => {
      if (category.competitors) {
        category.competitors.forEach(comp => {
          all.push({
            ...comp,
            category: category.name,
            categoryId: catId,
            categoryDesc: category.description,
            isSystem: true
          });
        });
      }
    });
    return all;
  },
  
  // 根据ID获取默认竞品
  getDefaultCompetitorById(id) {
    return this.getDefaultCompetitors().find(c => c.id === id);
  }
};
