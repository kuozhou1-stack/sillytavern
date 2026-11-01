<template>
  <div class="cw-linxin-app">
    <button v-if="actionError && actionError !== runtime?.view.error" class="cw-app-feedback" title="点击关闭提示" @click="actionError = ''"><span role="alert">{{ actionError }}</span><SvgIcon name="close" :size="12" /></button>
    <!-- 顶栏 -->
    <div class="cw-app-header">
      <div class="cw-header-left">
        <button v-if="activeChatId || currentTab !== 'chats'" class="cw-btn-icon" @click="handleBack">
          <SvgIcon name="chevronLeft" :size="20" />
        </button>
        <span class="cw-header-title">{{ headerTitle }}</span>
      </div>
      <div class="cw-header-right">
        <button
          class="cw-btn-icon"
          title="刷新当前页面"
          @click="action({ kind: 'refresh', id: activeChatId ?? undefined, text: currentTab })"
        >
          <SvgIcon name="refreshCw" :size="18" />
        </button>
        <button v-if="currentTab === 'moments'" class="cw-btn-icon" title="发朋友圈" @click="triggerNewMoment">
          <SvgIcon name="image" :size="18" />
        </button>
        <button
          v-if="activeChatId && currentTab !== 'directory' && currentTab !== 'groups'"
          class="cw-btn-icon"
          title="聊天信息与设置"
          @click="openActiveChatSettings"
        >
          <SvgIcon name="moreVertical" :size="18" />
        </button>
      </div>
    </div>

    <!-- 未建立账号提示横幅 (F19) -->
    <div v-if="!projection.account" class="cw-no-account-card">
      <div class="cw-no-acc-info">
        <SvgIcon name="info" :size="16" />
        <span>尚未开通邻信账号</span>
      </div>
      <p class="cw-no-acc-desc">开通邻信即可与街坊邻里收发消息、互加好友并发布生活动态。</p>
      <button class="cw-btn cw-btn-primary cw-btn-xs" @click="quickCreateAccount">一键开通邻信</button>
    </div>

    <!-- 视图：单聊/群聊对话窗口 -->
    <PhoneDirectory
      v-if="currentTab === 'directory' || currentTab === 'groups'"
      :initial-account="directoryAccount"
      :mode="directoryTab"
      :initial-group="directoryGroup"
      @chat="handleDirectoryChat"
      @open-group-chat="handleDirectoryGroupChat"
      @back="handleBack"
    />
    <div v-else-if="activeChatId" class="cw-chat-view">
      <button v-if="newMessages" class="cw-new-msg-btn" @click="latestMessage">{{ newMessages }} 条新消息，点击查看</button>
      <div ref="chatViewport" class="cw-chat-scroll">
        <div
          v-for="msg in activeChatMessages"
          :key="msg.id"
          v-read="msg.id"
          :data-feed-id="msg.id"
          class="cw-im-msg-row"
          :class="{ 'cw-im-self': msg.senderId === 'player' }"
        >
          <div class="cw-im-avatar">
            <CharacterAvatar :name="msg.senderName" :size="30" />
          </div>

          <div class="cw-im-bubble-wrap">
            <span class="cw-im-sender-name">{{ msg.senderName }}</span>

            <!-- 渲染 8 类消息内容块 -->
            <div class="cw-im-bubble">
              <template v-for="blk in msg.blocks" :key="blk.id">
                <!-- 1. 文字块 -->
                <div v-if="blk.type === 'text'" class="cw-blk-text">
                  {{ blk.content }}
                </div>

                <!-- 2. 图片块 -->
                <div v-else-if="blk.type === 'image'" class="cw-blk-image">
                  <div class="cw-fake-img">
                    <SvgIcon name="image" :size="24" />
                    <span>[图片：{{ blk.desc || '照片' }}]</span>
                  </div>
                </div>

                <!-- 3. 语音块 -->
                <div v-else-if="blk.type === 'voice'" class="cw-blk-voice">
                  <SvgIcon name="mic" :size="15" />
                  <span>语音 {{ blk.duration ?? '未知' }}"</span>
                  <details>
                    <summary>查看转写</summary>
                    {{ blk.转写文字 }}
                    <p>{{ blk.语气描述 }}</p>
                  </details>
                </div>

                <!-- 4. 表情块 -->
                <div v-else-if="blk.type === 'sticker'" class="cw-blk-sticker">
                  <SvgIcon name="smile" :size="28" />
                  <span>{{ blk.desc || '[动态表情]' }}</span>
                </div>

                <!-- 5. 视频块 -->
                <div v-else-if="blk.type === 'video'" class="cw-blk-video">
                  <SvgIcon name="video" :size="24" />
                  <span>[视频：{{ blk.desc || '短视频' }}]</span>
                </div>

                <!-- 6. 位置块 -->
                <div v-else-if="blk.type === 'location'" class="cw-blk-location" @click="openMedia(msg, blk)">
                  <SvgIcon name="mapPin" :size="18" class="cw-loc-icon" />
                  <div class="cw-loc-info">
                    <span class="cw-loc-name">{{ blk.title || '位置共享' }}</span>
                    <span class="cw-loc-addr">{{ blk.address ?? '地址未提供' }}</span>
                  </div>
                </div>

                <!-- 7. 名片块 -->
                <div v-else-if="blk.type === 'namecard'" class="cw-blk-card" @click="openMedia(msg, blk)">
                  <SvgIcon name="user" :size="20" />
                  <div class="cw-card-info">
                    <span class="cw-card-name">{{ blk.name || '个人名片' }}</span>
                    <span class="cw-card-sub">个人名片</span>
                  </div>
                </div>

                <!-- 8. 分享块 -->
                <div v-else-if="blk.type === 'share'" class="cw-blk-share" @click="openMedia(msg, blk)">
                  <SvgIcon name="share2" :size="18" />
                  <div class="cw-share-info">
                    <span class="cw-share-title">{{ blk.title || '分享链接' }}</span>
                    <span class="cw-share-desc">{{ blk.desc || '点击查看详情' }}</span>
                  </div>
                </div>
              </template>
            </div>
            <span class="cw-im-time">{{ msg.time }}</span>
            <button v-if="msg.senderId === 'player'" class="cw-action-link" @click="manage('retract', msg.id)">
              撤回
            </button>
          </div>
        </div>
      </div>

      <!-- 显式呈现发送中、失败及已有恢复操作 (解决 M06, F05) -->
      <div v-if="activeChatError" class="cw-im-status-strip is-error" role="alert">
        <div class="cw-im-status-info">
          <SvgIcon name="alertCircle" :size="13" />
          <span class="cw-im-status-text">{{ activeChatError }}</span>
        </div>
        <div class="cw-im-status-actions">
          <button type="button" class="cw-btn cw-btn-xs cw-btn-primary" :disabled="isPhoneBusy" @click="retryActiveTask">重试</button>
          <button type="button" class="cw-btn cw-btn-xs" :disabled="isPhoneBusy" @click="discardActiveTask">取消</button>
        </div>
      </div>
      <div v-else-if="isPhoneBusy" class="cw-im-status-strip is-busy" role="status">
        <SvgIcon name="refresh" :size="12" class="cw-spin" />
        <span>{{ phoneStatusText || '消息发送中，正在等待邻里回复…' }}</span>
        <button v-if="runtime?.view.phoneRequest?.status === 'sending'" type="button" class="cw-btn cw-btn-xs cw-btn-ghost" @click="runtime?.stop()">停止</button>
      </div>

      <!-- 对话底部输入条 (解决 M06：重排输入与发送按钮，自适应多行，右侧永不裁切) -->
      <div class="cw-chat-bottom-input">
        <button type="button" class="cw-btn cw-btn-ghost cw-btn-xs cw-im-more-btn" title="编辑多类型内容" @click="compose = 'send'">内容</button>
        <textarea
          v-model="draftReply"
          placeholder="发送消息... (Enter 发送，Shift+Enter 换行)"
          class="cw-im-textarea"
          rows="1"
          :disabled="isPhoneBusy"
          @input="adjustImInputHeight"
          @keydown="handleReplyKeydown"
        ></textarea>
        <button
          type="button"
          class="cw-btn cw-btn-primary cw-btn-xs cw-im-send-btn"
          :disabled="isPhoneBusy || isSendingReply || !draftReply.trim()"
          @click="sendImReply"
        >
          {{ isPhoneBusy || isSendingReply ? '发送中' : '发送' }}
        </button>
      </div>
    </div>

    <!-- 视图：主列表 (会话 / 通讯录 / 新的朋友 / 朋友圈) -->
    <div v-else class="cw-linxin-main">
      <!-- 1. 会话列表 -->
      <div v-if="currentTab === 'chats'" class="cw-session-list" :class="{ 'cw-list-empty': sessions.length === 0 }">
        <div v-for="s in sessions" :key="s.id" class="cw-session-item" @click="openSession(s.id)">
          <div class="cw-sess-avatar">
            <CharacterAvatar :name="s.name" :size="38" />
            <span v-if="s.unread" class="cw-badge-dot"></span>
          </div>
          <div class="cw-sess-main">
            <div class="cw-sess-top">
              <span class="cw-sess-name">{{ s.name }}</span>
              <span class="cw-sess-time">{{ s.lastTime }}</span>
            </div>
            <div class="cw-sess-preview">{{ s.lastMessage }}</div>
          </div>
        </div>

        <div v-if="sessions.length === 0" class="cw-empty-backdrop">
          <div class="cw-empty-graphic">
            <SvgIcon name="messageSquare" :size="38" />
          </div>
          <div class="cw-empty-title">暂无聊天会话</div>
          <div class="cw-empty-desc">在通讯录中选择街坊好友，开启属于你的都市日常交谈。</div>
          <button class="cw-btn cw-btn-ghost cw-btn-sm cw-empty-action" @click="currentTab = 'contacts'">
            前往通讯录
          </button>
        </div>
      </div>

      <!-- 2. 通讯录 -->
      <div v-else-if="currentTab === 'contacts'" class="cw-contacts-list" :class="{ 'cw-list-empty': contacts.length === 0 }">
        <!-- 实时搜索框 -->
        <div class="cw-contacts-search-wrap">
          <div class="cw-contacts-search-box">
            <SvgIcon name="search" :size="14" class="cw-contacts-search-icon" />
            <input
              v-model="contactQuery"
              type="search"
              class="cw-contacts-search-input"
              placeholder="搜索联系人姓名、备注、身份职业..."
              aria-label="搜索联系人"
            />
            <button
              v-if="contactQuery"
              type="button"
              class="cw-contacts-clear-btn"
              title="清空搜索"
              @click="contactQuery = ''"
            >
              ×
            </button>
          </div>
        </div>

        <!-- 功能快捷入口卡片组 -->
        <div class="cw-contact-action-grid">
          <!-- 好友申请入口 -->
          <div class="cw-contact-action-card" @click="currentTab = 'applications'">
            <div class="cw-action-icon-badge badge-orange">
              <SvgIcon name="userPlus" :size="18" />
            </div>
            <div class="cw-action-text-col">
              <span class="cw-action-title">新的朋友</span>
              <span class="cw-action-desc">好友申请与邻里结识</span>
            </div>
            <span v-if="pendingApplicationsCount > 0" class="cw-badge cw-badge-accent cw-badge-sm">
              {{ pendingApplicationsCount }}
            </span>
            <SvgIcon name="chevronRight" :size="16" class="cw-action-arrow" />
          </div>

          <!-- 独立的联系人资料入口 -->
          <div class="cw-contact-action-card" @click="openDirectory()">
            <div class="cw-action-icon-badge badge-green">
              <SvgIcon name="user" :size="18" />
            </div>
            <div class="cw-action-text-col">
              <span class="cw-action-title">联系人资料与偏好</span>
              <span class="cw-action-desc">好友备注、屏蔽与免打扰</span>
            </div>
            <SvgIcon name="chevronRight" :size="16" class="cw-action-arrow" />
          </div>
          <div class="cw-contact-action-card" @click="openGroupDirectory()">
            <div class="cw-action-icon-badge badge-green"><SvgIcon name="users" :size="18" /></div>
            <div class="cw-action-text-col">
              <span class="cw-action-title">群聊管理与邀约</span>
              <span class="cw-action-desc">群资料、成员与多人建群</span>
            </div>
            <SvgIcon name="chevronRight" :size="16" class="cw-action-arrow" />
          </div>
        </div>

        <!-- 联系人列表分栏指示 -->
        <div class="cw-contacts-section-bar">
          <span class="cw-contacts-count-label">全部联系人 ({{ filteredContacts.length }})</span>
          <span v-if="contactQuery" class="cw-search-matching-tip">已按关键词筛选</span>
        </div>

        <!-- 联系人卡片流 -->
        <div v-if="filteredContacts.length > 0" class="cw-contacts-cards-stream">
          <div
            v-for="c in filteredContacts"
            :key="c.id"
            class="cw-contact-card"
            @click="startChatWith(c)"
          >
            <div class="cw-contact-avatar-wrap">
              <CharacterAvatar :name="c.name" :size="38" shape="rounded" />
            </div>

            <div class="cw-contact-main-info">
              <div class="cw-contact-name-row">
                <span class="cw-contact-display-name">{{ c.name }}</span>
                <span
                  v-if="getContactInfo(c.id).tier"
                  class="cw-badge cw-badge-xs"
                  :class="getContactInfo(c.id).tier === '主要' ? 'cw-badge-accent' : 'cw-badge-subtle'"
                >
                  {{ getContactInfo(c.id).tier }}
                </span>
              </div>
              <div class="cw-contact-sub-text" :title="getContactInfo(c.id).identity">
                {{ getContactInfo(c.id).identity }}
              </div>
            </div>

            <div class="cw-contact-quick-actions" @click.stop>
              <button
                type="button"
                class="cw-contact-action-btn btn-chat"
                title="发消息"
                @click.stop="startChatWith(c)"
              >
                <SvgIcon name="messageSquare" :size="15" />
              </button>
              <button
                type="button"
                class="cw-contact-action-btn btn-profile"
                title="资料与设置"
                @click.stop="openDirectory(c.id)"
              >
                <SvgIcon name="user" :size="15" />
              </button>
            </div>
          </div>
        </div>

        <!-- 搜索无结果 -->
        <div v-else-if="contactQuery && contacts.length > 0" class="cw-contact-no-match">
          <SvgIcon name="search" :size="24" class="cw-no-match-icon" />
          <span>未找到与「{{ contactQuery }}」匹配的联系人</span>
          <button type="button" class="cw-btn cw-btn-ghost cw-btn-xs" @click="contactQuery = ''">清空搜索</button>
        </div>

        <!-- 空通讯录 -->
        <div v-else-if="contacts.length === 0" class="cw-empty-backdrop">
          <div class="cw-empty-graphic">
            <SvgIcon name="users" :size="38" />
          </div>
          <div class="cw-empty-title">暂无邻信联系人</div>
          <div class="cw-empty-desc">可通过「新的朋友」添加结识的街坊，或在城市漫步中结识新市民。</div>
          <button class="cw-btn cw-btn-ghost cw-btn-sm cw-empty-action" @click="currentTab = 'applications'">
            查看好友申请
          </button>
        </div>
      </div>

      <!-- 2.5 新的朋友与申请管理页 (F15) -->
      <div v-else-if="currentTab === 'applications'" class="cw-applications-view">
        <div class="cw-apps-container">
          <!-- 顶部快捷切换 Tabs -->
          <div class="cw-apps-nav-tabs">
            <button
              type="button"
              class="cw-apps-tab-btn"
              :class="{ active: appsTab === 'pending' }"
              @click="appsTab = 'pending'"
            >
              <SvgIcon name="userCheck" :size="14" />
              <span>待处理申请</span>
              <span v-if="pendingApplicationsCount > 0" class="cw-apps-counter-badge">{{ pendingApplicationsCount }}</span>
            </button>
            <button
              type="button"
              class="cw-apps-tab-btn"
              :class="{ active: appsTab === 'all' }"
              @click="appsTab = 'all'"
            >
              <SvgIcon name="list" :size="14" />
              <span>全部记录 ({{ applicationList.length }})</span>
            </button>
            <button
              type="button"
              class="cw-apps-tab-btn"
              :class="{ active: appsTab === 'add' }"
              @click="appsTab = 'add'"
            >
              <SvgIcon name="userPlus" :size="14" />
              <span>添加新朋友</span>
            </button>
          </div>

          <!-- 子视图 1 & 2: 好友申请名录 -->
          <div v-if="appsTab === 'pending' || appsTab === 'all'" class="cw-apps-section">
            <div class="cw-section-header-row">
              <span class="cw-section-subtitle">
                {{ appsTab === 'pending' ? '待处理申请' : '全部申请记录' }} ({{ displayedApplications.length }})
              </span>
              <button
                v-if="appsTab !== 'add'"
                type="button"
                class="cw-btn-quick-add-link"
                @click="appsTab = 'add'"
              >
                + 添加朋友
              </button>
            </div>

            <div v-if="displayedApplications.length > 0" class="cw-apps-list">
              <div
                v-for="a in displayedApplications"
                :key="a.id"
                class="cw-app-card"
                :class="{ 'is-pending': a.状态 === '待处理' }"
              >
                <div class="cw-app-avatar-wrap">
                  <CharacterAvatar :name="a.otherName" :size="40" shape="rounded" />
                  <span
                    class="cw-app-dir-badge"
                    :class="a.目标账号id === projection.account ? 'badge-in' : 'badge-out'"
                    :title="a.目标账号id === projection.account ? '收到的申请' : '我发出的申请'"
                  >
                    {{ a.目标账号id === projection.account ? '收' : '发' }}
                  </span>
                </div>

                <div class="cw-app-info">
                  <div class="cw-app-name-row">
                    <span class="cw-app-name">{{ a.otherName }}</span>
                    <span
                      v-if="getContactInfo(a.otherAccountId).tier"
                      class="cw-badge cw-badge-xs"
                      :class="getContactInfo(a.otherAccountId).tier === '主要' ? 'cw-badge-accent' : 'cw-badge-subtle'"
                    >
                      {{ getContactInfo(a.otherAccountId).tier }}
                    </span>
                    <span class="cw-app-status-pill" :data-status="a.状态">{{ applicationStatus(a.状态) }}</span>
                  </div>

                  <div class="cw-app-note-bubble">
                    <span class="cw-quote-mark">“</span>
                    <span class="cw-note-text">{{ a.说明 || '请求添加为邻信好友' }}</span>
                    <span class="cw-quote-mark">”</span>
                  </div>
                </div>

                <div class="cw-app-actions">
                  <template v-if="a.状态 === '待处理'">
                    <template v-if="a.目标账号id === projection.account">
                      <button
                        type="button"
                        class="cw-btn cw-btn-primary cw-btn-xs cw-app-btn-pass"
                        :disabled="processingApplications.has(a.id) || runtime?.view.busy || runtime?.view.updating"
                        @click="handleAppAction('accept', a.id)"
                      >
                        通过
                      </button>
                      <button
                        type="button"
                        class="cw-btn cw-btn-ghost cw-btn-xs cw-app-btn-reject"
                        :disabled="processingApplications.has(a.id) || runtime?.view.busy || runtime?.view.updating"
                        @click="handleAppAction('reject', a.id)"
                      >
                        拒绝
                      </button>
                    </template>
                    <template v-else>
                      <button
                        type="button"
                        class="cw-btn cw-btn-ghost cw-btn-xs cw-app-btn-withdraw"
                        :disabled="processingApplications.has(a.id) || runtime?.view.busy || runtime?.view.updating"
                        @click="handleAppAction('withdraw', a.id)"
                      >
                        撤回申请
                      </button>
                    </template>
                  </template>
                  <span v-else class="cw-app-settled-text">
                    {{ a.状态 === '接受' ? '已成为好友' : applicationStatus(a.状态) }}
                  </span>
                </div>
              </div>
            </div>

            <div v-else class="cw-empty-compact" style="margin: 24px 0;">
              <SvgIcon name="userCheck" :size="28" class="cw-empty-icon" />
              <span>{{ appsTab === 'pending' ? '暂无待处理的好友申请' : '暂无任何好友申请记录' }}</span>
              <button
                v-if="appsTab === 'pending'"
                type="button"
                class="cw-btn cw-btn-ghost cw-btn-xs"
                @click="appsTab = 'add'"
              >
                主动添加新朋友
              </button>
            </div>
          </div>

          <!-- 子视图 3: 发起添加新朋友 -->
          <div v-else class="cw-apps-section">
            <div class="cw-add-friend-hero-card">
              <div class="cw-add-hero-icon">
                <SvgIcon name="userPlus" :size="24" />
              </div>
              <div class="cw-add-hero-text">
                <h4 class="cw-add-hero-title">结识新邻里</h4>
                <p class="cw-add-hero-desc">向瓦罗兰都市中已知账号发送添加申请，对方同意后即建立通讯录好友关系。</p>
              </div>
            </div>

            <div v-if="Object.keys(addableKnownAccounts).length > 0 || knownAccountQuery" class="cw-add-friend-interactive-card">
              <!-- 快捷候选街坊列表 -->
              <div class="cw-add-form-group">
                <label class="cw-add-field-label">
                  <SvgIcon name="users" :size="13" />
                  <span>选择要添加的街坊账号</span>
                </label>
                <input v-model="knownAccountQuery" class="cw-dir-input" placeholder="搜索已知账号、昵称或身份" aria-label="搜索可添加的已知账号" />
                <p v-if="!Object.keys(addableKnownAccounts).length" class="cw-section-subtitle">暂无匹配的可添加账号</p>
                <div class="cw-candidate-chips-scroll">
                  <button
                    v-for="(acc, id) in addableKnownAccounts"
                    :key="id"
                    type="button"
                    class="cw-candidate-chip"
                    :class="{ active: targetApplyAccount === id }"
                    @click="targetApplyAccount = id"
                  >
                    <CharacterAvatar :name="acc.昵称 || acc.账号名" :size="24" shape="rounded" />
                    <span class="cw-candidate-name">{{ acc.昵称 || acc.账号名 }}</span>
                  </button>
                </div>
                <select v-model="targetApplyAccount" class="cw-dir-select" style="margin-top: 6px;">
                  <option value="">-- 或在下拉列表中选择账号 --</option>
                  <option v-for="(acc, id) in addableKnownAccounts" :key="id" :value="id">
                    {{ acc.昵称 || acc.账号名 }} (@{{ id }})
                  </option>
                </select>
              </div>

              <!-- 验证申请留言 -->
              <div class="cw-add-form-group">
                <div class="cw-label-with-presets">
                  <label class="cw-add-field-label">
                    <SvgIcon name="edit" :size="13" />
                    <span>验证申请说明</span>
                  </label>
                  <div class="cw-preset-chips">
                    <button
                      v-for="preset in presetApplyNotes"
                      :key="preset"
                      type="button"
                      class="cw-preset-chip"
                      @click="applyNote = preset"
                    >
                      {{ preset }}
                    </button>
                  </div>
                </div>
                <input
                  v-model="applyNote"
                  placeholder="填写验证说明 (例如：街区邻居、在微澜看到你)..."
                  class="cw-dir-input"
                />
              </div>

              <div class="cw-add-action-row">
                <button
                  type="button"
                  class="cw-btn cw-btn-primary cw-btn-block cw-btn-send-apply"
                  :disabled="!targetApplyAccount || !addableKnownAccounts[targetApplyAccount] || isSendingApply || runtime?.view.busy || runtime?.view.updating"
                  @click="sendApplication"
                >
                  <SvgIcon name="userPlus" :size="15" :class="{ 'cw-task-spin': isSendingApply }" />
                  <span>{{ isSendingApply ? '正在发送申请…' : '发送好友申请' }}</span>
                </button>
              </div>
            </div>

            <!-- 无已知可添加账号时的友好引导 -->
            <div v-else class="cw-no-known-guide-card">
              <div class="cw-guide-icon-wrap">
                <SvgIcon name="compass" :size="32" />
              </div>
              <h5 class="cw-guide-title">暂无可添加的已知新账号</h5>
              <p class="cw-guide-desc">
                在瓦罗兰都市漫步、探索街区地点或在「微澜」社区互动结识新的街坊后，其账号名片将自动沉淀在已知列表，即可在此处申请结识为好友。
              </p>
              <button
                type="button"
                class="cw-btn cw-btn-ghost cw-btn-sm"
                @click="appsTab = 'pending'"
              >
                返回待处理列表
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. 朋友圈 -->
      <div v-else-if="currentTab === 'moments'" ref="momentsViewport" class="cw-moments-view" :class="{ 'cw-list-empty': moments.length === 0 }">
        <button v-if="newMoments" class="cw-new-msg-btn" @click="latestMoment">{{ newMoments }} 条新动态，点击查看</button>
        
        <!-- 朋友圈流光封面与个人形象卡片 -->
        <div class="cw-moments-hero-cover">
          <div class="cw-cover-gradient-layer"></div>
          <button class="cw-btn-post-camera" title="发朋友圈" @click="triggerNewMoment">
            <SvgIcon name="camera" :size="18" />
          </button>
          
          <div class="cw-cover-user-card">
            <div class="cw-user-texts">
              <span class="cw-user-name">{{ player?.姓名 || '我' }}</span>
              <span class="cw-user-motto" :title="playerResidenceText">
                {{ playerResidenceText }}
              </span>
            </div>
            <div class="cw-user-avatar-frame">
              <CharacterAvatar :name="player?.姓名 || '我'" :size="48" shape="rounded" />
            </div>
          </div>
        </div>

        <!-- 朋友圈动态列表 -->
        <div class="cw-moments-list">
          <div v-for="post in moments" :key="post.id" :data-feed-id="post.id" class="cw-moment-item">
            <div class="cw-moment-avatar-col">
              <CharacterAvatar :name="post.authorName" :size="38" shape="rounded" />
            </div>

            <div class="cw-moment-content-col">
              <!-- 作者姓名与身份标签 -->
              <div class="cw-moment-author-row">
                <span class="cw-moment-author-name">{{ post.authorName }}</span>
                <span v-if="getMomentAuthorIdentity(post)" class="cw-author-role-badge">
                  {{ getMomentAuthorIdentity(post) }}
                </span>
              </div>

              <!-- 动态文字正文 -->
              <p class="cw-moment-body-text">{{ post.content }}</p>

              <!-- 现代朋友圈多图相册 -->
              <div v-if="post.images && post.images.length > 0" class="cw-moment-gallery" :data-count="Math.min(post.images.length, 9)">
                <div v-for="(img, idx) in post.images.slice(0, 9)" :key="idx" class="cw-gallery-photo-card">
                  <div class="cw-photo-bg-pattern">
                    <SvgIcon name="image" :size="20" class="cw-photo-icon" />
                  </div>
                  <span class="cw-photo-label" :title="img">{{ img }}</span>
                  <span v-if="idx === 8 && post.images.length > 9" class="cw-photo-label" :title="post.images.slice(9).join('；')">另有 {{ post.images.length - 9 }} 张</span>
                </div>
              </div>

              <!-- 底部操作与时间栏 -->
              <div class="cw-moment-meta-bar">
                <div class="cw-meta-left">
                  <span class="cw-moment-timestamp">{{ post.time }}</span>
                  <template v-if="post.accountId === projection.account">
                    <button type="button" class="cw-link-subtle" @click="startEditPost(post)">编辑</button>
                    <button type="button" class="cw-link-subtle cw-link-danger" @click="manage('deletePost', post.id)">删除</button>
                  </template>
                </div>

                <div class="cw-meta-actions">
                  <button
                    type="button"
                    class="cw-moment-action-pill"
                    :class="{ 'is-liked': post.isLiked }"
                    title="点赞"
                    @click="toggleLike(post)"
                  >
                    <SvgIcon name="heart" :size="13" />
                    <span>{{ post.likes?.length || '赞' }}</span>
                  </button>
                  <button
                    type="button"
                    class="cw-moment-action-pill"
                    title="评论"
                    @click="openInlineComment(post.id)"
                  >
                    <SvgIcon name="messageSquare" :size="13" />
                    <span>{{ post.comments?.length || '评论' }}</span>
                  </button>
                </div>
              </div>

              <!-- 内联评论回复输入条 -->
              <div v-if="activeCommentPostId === post.id" class="cw-inline-comment-box">
                <input
                  v-model="inlineCommentDraft"
                  :placeholder="activeReplyCommentId ? '回复评论...' : '写评论...'"
                  class="cw-inline-input"
                  autofocus
                  @keydown.enter="handleInlineCommentKeydown"
                />
                <button
                  type="button"
                  class="cw-btn cw-btn-primary cw-btn-xs"
                  :disabled="!inlineCommentDraft.trim() || isSubmittingComment || runtime?.view.busy || runtime?.view.updating"
                  @click="submitInlineComment"
                >
                  发送
                </button>
                <button
                  type="button"
                  class="cw-btn cw-btn-ghost cw-btn-xs"
                  @click="activeCommentPostId = null"
                >
                  取消
                </button>
              </div>

              <!-- 评论与点赞气泡区 -->
              <div
                v-if="(post.likes && post.likes.length > 0) || (post.comments && post.comments.length > 0)"
                class="cw-moment-interaction-bubble"
              >
                <!-- 点赞行 -->
                <div v-if="post.likes?.length > 0" class="cw-bubble-likes-row">
                  <SvgIcon name="heart" :size="12" class="cw-like-icon" />
                  <span class="cw-like-names">{{ post.likes.join('、') }}</span>
                </div>

                <!-- 评论列表 -->
                <div v-if="post.comments?.length > 0" class="cw-bubble-comments-col">
                  <PhoneComments :comments="post.comments" @reply="id => replyInlineTo(post.id, id)" />
                </div>
              </div>
            </div>
          </div>

          <!-- 朋友圈空状态 -->
          <div v-if="moments.length === 0" class="cw-empty-backdrop">
            <div class="cw-empty-graphic">
              <SvgIcon name="image" :size="38" />
            </div>
            <div class="cw-empty-title">朋友圈暂无动态</div>
            <div class="cw-empty-desc">分享您在都会街头的漫步日常与生活瞬间。</div>
            <button class="cw-btn cw-btn-primary cw-btn-sm cw-empty-action" @click="compose = 'post'">
              发布第一条动态
            </button>
          </div>
        </div>
      </div>

      <!-- 底部三 Tab 栏 -->
      <div class="cw-linxin-bottom-tabs">
        <button class="cw-app-tab-btn" :class="{ active: currentTab === 'chats' }" @click="currentTab = 'chats'">
          <SvgIcon name="messageSquare" :size="20" />
          <span>消息</span>
        </button>
        <button class="cw-app-tab-btn" :class="{ active: currentTab === 'contacts' || currentTab === 'applications' }" @click="currentTab = 'contacts'">
          <SvgIcon name="users" :size="20" />
          <span>通讯录</span>
        </button>
        <button class="cw-app-tab-btn" :class="{ active: currentTab === 'moments' }" @click="currentTab = 'moments'">
          <SvgIcon name="image" :size="20" />
          <span>朋友圈</span>
        </button>
      </div>
    </div>
    <PhoneComposer v-if="compose" :kind="compose" platform="邻信" @close="compose = null" @submit="submitComposition" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch, onBeforeUnmount, onActivated, onDeactivated } from 'vue';
import { ensurePhoneSession, managePhone } from '../../../../../运行/phone-management';
import { useWorldState } from '../../../utils/context';
import { phoneProjection, storyMinute } from '../../../../../运行/phone';
import PhoneComments from '../PhoneComments.vue';
import PhoneDirectory from '../PhoneDirectory.vue';
import { RuntimeKey, type Runtime } from '../../../../../运行/host';
import { useStableFeed } from '../../../utils/stable-feed';
import { useLinxinDrafts } from '../../../utils/linxin-drafts';
const state = useWorldState();
const runtime = inject<Runtime | null>(RuntimeKey, null);
const projection = computed(() => phoneProjection(state.value, '邻信'));
const actionError = ref('');
let isActive = true;
onActivated(() => { isActive = true; });
onDeactivated(() => { isActive = false; seen.clear(); });
const seen = new Set<string>(),
  observers = new Map<Element, IntersectionObserver>();
const vRead = {
  mounted(el: Element, binding: { value: string }) {
    const observer = new IntersectionObserver(
      entries => {
        if (isActive && entries.some(e => e.isIntersecting)) seen.add(binding.value);
      },
      { root: el.closest('.cw-chat-scroll'), threshold: 0.5 },
    );
    observer.observe(el);
    observers.set(el, observer);
  },
  unmounted(el: Element) {
    observers.get(el)?.disconnect();
    observers.delete(el);
  },
};
const readTimer = setInterval(async () => {
  if (!isActive || !runtime || runtime.view.busy || runtime.view.updating || !seen.size) return;
  const ids = [...seen].filter(id => state.value.手机.原文.消息[id]);
  seen.clear();
  const unread = ids.filter(
    id =>
      !state.value.手机._阅读进度[projection.value.account!]?.[
        state.value.手机.原文.消息[id].会话id!
      ]?.已读内容id.includes(id),
  );
  if (!unread.length) return;
  try {
    await runtime.commit(s => {
      for (const id of unread) s = managePhone(s, 'readMessage', id);
      return s;
    });
  } catch (e) {
    unread.forEach(id => seen.add(id));
    actionError.value = String(e);
  }
}, 1000);
onBeforeUnmount(() => {
  isActive = false;
  seen.clear();
  clearInterval(readTimer);
  observers.forEach(o => o.disconnect());
  observers.clear();
});
async function action(a: any) {
  if (!runtime) {
    actionError.value = '离线展示不写入存档';
    return false;
  }
  try {
    await runtime.phoneAction({ ...a, platform: '邻信' });
    actionError.value = '';
    return true;
  } catch (e) {
    actionError.value = String(e);
    return false;
  }
}
import SvgIcon from '../../icons/SvgIcon.vue';
import CharacterAvatar from '../../shared/CharacterAvatar.vue';
import PhoneComposer from '../PhoneComposer.vue';
const compose = ref<'send' | 'post' | null>(null);
async function submitComposition(value: any) {
  if (await action({ kind: compose.value, id: compose.value === 'send' ? activeChatId.value : undefined, ...value }))
    compose.value = null;
}

const props = defineProps<{
  player: any;
  phoneData?: any;
}>();

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'navigate', target: { type: string; id: string }): void;
}>();

async function openMedia(msg: any, b: any) {
  try {
    if (runtime) await runtime.commit(s => managePhone(s, 'readMessage', msg.id));
    emit(
      'navigate',
      b.type === 'location'
        ? { type: '地点', id: b.地点id }
        : b.type === 'namecard'
          ? { type: '账号', id: b.账号id }
          : { type: b.目标类型, id: b.目标id },
    );
  } catch (e) {
    actionError.value = String(e);
  }
}

const currentTab = ref<'chats' | 'contacts' | 'moments' | 'applications' | 'directory' | 'groups'>('chats');
const directoryAccount = ref('');
const directoryGroup = ref('');
const directoryTab = ref<'contacts' | 'groups'>('contacts');
let directoryReturn: { tab: typeof currentTab.value; chatId: string | null } | null = null;
function openDirectory(id = '') {
  if (currentTab.value !== 'directory' && currentTab.value !== 'groups') directoryReturn = { tab: currentTab.value, chatId: activeChatId.value };
  directoryAccount.value = id;
  directoryGroup.value = '';
  directoryTab.value = 'contacts';
  currentTab.value = 'directory';
}
function openGroupDirectory(groupId = '') {
  if (currentTab.value !== 'directory' && currentTab.value !== 'groups') directoryReturn = { tab: currentTab.value, chatId: activeChatId.value };
  directoryAccount.value = '';
  directoryGroup.value = groupId;
  directoryTab.value = 'groups';
  currentTab.value = 'groups';
}
const activeChatId = ref<string | null>(null);
const drafts = useLinxinDrafts(runtime);
const draftSession = computed(() => drafts.session());
const draftReply = computed({
  get: () => activeChatId.value ? (draftSession.value.replies[activeChatId.value] ?? '') : '',
  set: value => {
    if (activeChatId.value) draftSession.value.replies[activeChatId.value] = value;
  },
});
const isSendingReply = computed(() => draftSession.value.busy && draftSession.value.sendingTarget === activeChatId.value);

const isPhoneBusy = computed(() => {
  const req = runtime?.view.phoneRequest;
  if (req && ['sending', 'settling', 'saving', 'stopping'].includes(req.status)) {
    return true;
  }
  if (draftSession.value.busy) return true;
  if (runtime?.view.busy && (runtime?.view.operation === 'phone' || runtime?.view.operation === 'recovery')) {
    return true;
  }
  return false;
});

const phoneStatusText = computed(() => {
  const req = runtime?.view.phoneRequest;
  const prefix = phoneRequestLabel.value;
  if (req) {
    if (req.status === 'stopping') return prefix + '正在停止本次手机请求…';
    if (req.status === 'saving') return prefix + '正在保存会话记录与世界变更…';
    if (req.status === 'settling') return prefix + '已收到邻里回复，正在结算剧情与状态…';
    if (req.status === 'sending') return prefix + '消息发送中，正在等待邻里回复…';
  }
  if (draftSession.value.busy) return '正在等待本次操作确认…';
  if (isSendingReply.value || (runtime?.view.busy && (runtime?.view.operation === 'phone' || runtime?.view.operation === 'recovery'))) {
    return '消息发送中，正在等待邻里回复…';
  }
  return '';
});

const phoneRequestLabel = computed(() => {
  const req = runtime?.view.phoneRequest;
  if (!req) return '';
  if (req.platform !== '邻信') return `${req.platform}操作：`;
  if (req.kind !== 'send') return '邻信其他操作：';
  if (req.targetId === activeChatId.value) return '';
  return `另一会话「${sessions.value.find(s => s.id === req.targetId)?.name || '未知会话'}」：`;
});

const activeChatError = computed(() => {
  if (isPhoneBusy.value) return '';
  if (runtime?.view.phoneRequest?.status === 'failed')
    return phoneRequestLabel.value + (actionError.value || runtime.view.error || '手机请求发送失败');
  return actionError.value;
});

async function retryActiveTask() {
  if (!runtime || isPhoneBusy.value) return;
  actionError.value = '';
  try {
    await drafts.retry(draftSession.value);
  } catch (e) {
    actionError.value = String(e);
  }
}

async function discardActiveTask() {
  if (isPhoneBusy.value) return;
  actionError.value = '';
  try {
    await drafts.discard(draftSession.value);
  } catch (e) {
    actionError.value = String(e);
  }
}

function adjustImInputHeight(e: Event) {
  const el = e.target as HTMLTextAreaElement;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 72)}px`;
}

// 快速开通账号 (F19)
async function quickCreateAccount() {
  if (!runtime) {
    actionError.value = '离线预览模式无法写入存档';
    return;
  }
  try {
    const accName = props.player?.姓名 || '瓦罗兰居民';
    await runtime.commit(s => managePhone(s, 'createAccount', '邻信', accName));
    actionError.value = '';
  } catch (e) {
    actionError.value = String(e);
  }
}

// 演示会话列表（含群聊与私聊）
const sessions = computed(() => projection.value.sessions);

// 演示 8 类消息块的聊天记录
const messagesMap = computed(() => projection.value.messagesMap);

// 通讯录
const contacts = computed(() => projection.value.contacts);
const contactQuery = ref('');

function getContactInfo(contactId: string) {
  const acc = state.value?.手机?.账号?.[contactId];
  const charId = acc?.人物id;
  const person = charId ? (state.value?.角色?.[charId] || (state.value as any)?.['主要角色']?.[charId]) : null;
  const identity = person?.身份 || person?.基础信息?.身份 || acc?.公开资料?.身份 || acc?.公开资料?.职业 || '邻信好友';
  const tier = person?.层级 || (person ? '主要' : null);
  return { acc, person, identity, tier };
}

const filteredContacts = computed(() => {
  const q = contactQuery.value.trim().toLowerCase();
  if (!q) return contacts.value;
  return contacts.value.filter(c => {
    const info = getContactInfo(c.id);
    const nameMatch = [c.name, info.acc?.昵称, info.acc?.账号名].some(value => (value || '').toLowerCase().includes(q));
    const identityMatch = (info.identity || '').toLowerCase().includes(q);
    return nameMatch || identityMatch;
  });
});

const pendingApplicationsCount = computed(() => projection.value.pendingApplicationsCount);

// 好友申请列表与操作 (F15)
const applicationList = computed(() => {
  const apps = state.value?.手机?.申请 || {};
  const selfAcc = projection.value.account;
  const accounts = state.value?.手机?.账号 || {};
  return Object.entries(apps)
    .filter(([, a]: any) => a.目标账号id === selfAcc || a.发起账号id === selfAcc)
    .map(([id, a]: any) => ({
      id,
      ...a,
      senderName: accounts[a.发起账号id]?.昵称 || accounts[a.发起账号id]?.账号名 || a.发起账号id,
      targetName: accounts[a.目标账号id]?.昵称 || accounts[a.目标账号id]?.账号名 || a.目标账号id,
      otherAccountId: a.目标账号id === selfAcc ? a.发起账号id : a.目标账号id,
      otherName: accounts[a.目标账号id === selfAcc ? a.发起账号id : a.目标账号id]?.昵称 ||
        accounts[a.目标账号id === selfAcc ? a.发起账号id : a.目标账号id]?.账号名 || '账号资料已移除',
    }))
    .sort((a, b) => storyMinute(b.时间) - storyMinute(a.时间));
});
function applicationStatus(status: string) {
  return ({ 接受: '已通过', 拒绝: '已拒绝', 撤销: '已撤回' } as Record<string, string>)[status] || status;
}

const appsTab = ref<'pending' | 'all' | 'add'>('pending');
const targetApplyAccount = ref('');
const applyNote = ref('');
const isSendingApply = ref(false);
const processingApplications = ref(new Set<string>());
const knownAccountQuery = ref('');
const presetApplyNotes = ['街区邻居', '在微澜看到了你', '朋友介绍认识', '日常打个招呼'];

const displayedApplications = computed(() => {
  if (appsTab.value === 'pending') {
    return applicationList.value.filter(a => a.状态 === '待处理');
  }
  return applicationList.value;
});

const addableKnownAccounts = computed(() => {
  const known = state.value?.玩家?.已知信息?.已知账号 || {};
  const selfAcc = projection.value.account;
  const unavailable = new Set(Object.values(state.value.手机.联系人)
    .filter((c: any) => c.本人账号id === selfAcc && c.状态 !== '移除').map((c: any) => c.对方账号id));
  const pending = new Set(applicationList.value.filter(a => a.状态 === '待处理').map(a => a.otherAccountId));
  const accounts = state.value?.手机?.账号 || {};
  const q = knownAccountQuery.value.trim().toLowerCase();
  return Object.fromEntries(
    Object.entries(accounts).filter(
      ([id, a]: any) =>
        a.平台 === '邻信' &&
        id !== selfAcc &&
        !unavailable.has(id) && !pending.has(id) &&
        !state.value._系统.角色停用标识[a.人物id] &&
        Object.hasOwn(known, id) &&
        (!q || [a.昵称, a.账号名, getContactInfo(id).identity].some(value => (value || '').toLowerCase().includes(q))),
    ),
  );
});

async function handleAppAction(op: 'accept' | 'reject' | 'withdraw', id: string) {
  if (!runtime || processingApplications.value.has(id) || runtime.view.busy || runtime.view.updating) return;
  processingApplications.value.add(id);
  try {
    await runtime.commit(s => managePhone(s, op, id));
    actionError.value = '';
  } catch (e) {
    actionError.value = String(e);
  } finally {
    processingApplications.value.delete(id);
  }
}

async function sendApplication() {
  if (!runtime || !targetApplyAccount.value || !addableKnownAccounts.value[targetApplyAccount.value] || isSendingApply.value) return;
  const target = targetApplyAccount.value, note = applyNote.value;
  isSendingApply.value = true;
  try {
    await runtime.commit(s => managePhone(s, 'apply', target, note.trim() || '街区邻居'));
    if (targetApplyAccount.value === target && applyNote.value === note) {
      targetApplyAccount.value = '';
      applyNote.value = '';
      if (appsTab.value === 'add') appsTab.value = 'all';
    }
    actionError.value = '';
  } catch (e) {
    actionError.value = String(e);
  } finally {
    isSendingApply.value = false;
  }
}

async function handleDirectoryChat(accountId: string) {
  await startChatWith({ id: accountId });
}

async function handleDirectoryGroupChat(groupId: string) {
  const existing = Object.entries(state.value.手机.会话).find(([, session]) => session.类型 === '群聊' && session.群id === groupId && session.参与账号id.includes(projection.value.account));
  if (existing) { activeChatId.value = existing[0]; currentTab.value = 'chats'; actionError.value = ''; return; }
  if (!runtime) { actionError.value = '离线展示不创建会话'; return; }
  try {
    let sessionId = '';
    await runtime.commit(s => {
      const opened = ensurePhoneSession(s, '群聊', groupId);
      sessionId = opened.id;
      return opened.state;
    });
    activeChatId.value = sessionId;
    currentTab.value = 'chats';
    actionError.value = '';
  } catch (e) {
    actionError.value = String(e);
  }
}

function openActiveChatSettings() {
  if (!activeChatId.value) return;
  const sess = sessions.value.find(s => s.id === activeChatId.value);
  if (sess?.isGroup) {
    const rawSess = state.value.手机.会话[activeChatId.value];
    openGroupDirectory(rawSess?.群id || '');
  } else {
    const rawSess = state.value?.手机?.会话?.[activeChatId.value];
    const otherId = rawSess?.参与账号id?.find((id: string) => id !== projection.value.account);
    openDirectory(otherId || '');
  }
}

// 朋友圈动态
const moments = computed(() => projection.value.posts);

const playerResidenceText = computed(() => {
  const p = props.player;
  if (!p) return '瓦洛兰生活漫步中';
  const place = state.value.地点[p.生活?.住处id]?.名称 || '';
  return place ? `现居 ${place} · 都市生活漫步中` : '瓦洛兰生活漫步中';
});

function getMomentAuthorIdentity(post: any) {
  if (post.accountId === projection.value.account) return '我';
  const acc = state.value?.手机?.账号?.[post.accountId];
  const charId = acc?.人物id;
  const person = charId ? (state.value?.角色?.[charId] || (state.value as any)?.['主要角色']?.[charId]) : null;
  return person?.身份 || person?.基础信息?.身份 || '';
}

const headerTitle = computed(() => {
  if (currentTab.value === 'groups') return '群聊管理与邀约';
  if (currentTab.value === 'directory') return '联系人资料与偏好';
  if (activeChatId.value) {
    const s = sessions.value.find(item => item.id === activeChatId.value);
    return s ? s.name : '聊天';
  }
  if (currentTab.value === 'moments') return '朋友圈';
  if (currentTab.value === 'contacts') return '通讯录';
  if (currentTab.value === 'directory') return '联系人与群组';
  if (currentTab.value === 'applications') return '新的朋友';
  return '邻信';
});

// F17: 私聊按时间正序排列（旧到新），最新消息在底部靠近输入框
const activeChatMessages = computed(() => {
  if (!activeChatId.value) return [];
  const list = messagesMap.value[activeChatId.value] || [];
  return [...list].reverse();
});

const {
  viewport: chatViewport,
  pending: newMessages,
  latest: latestMessage,
} = useStableFeed(
  () => activeChatMessages.value.map(m => m.id),
  () => activeChatId.value,
  'bottom',
);
const {
  viewport: momentsViewport,
  pending: newMoments,
  latest: latestMoment,
} = useStableFeed(
  () => moments.value.map(m => m.id),
  () => currentTab.value,
);

function handleBack() {
  if (currentTab.value === 'directory' || currentTab.value === 'groups') {
    const destination = directoryReturn;
    currentTab.value = destination?.tab ?? 'contacts';
    activeChatId.value = destination?.chatId ?? null;
    directoryReturn = null;
  } else if (activeChatId.value) {
    activeChatId.value = null;
  } else if (currentTab.value === 'applications') {
    currentTab.value = 'contacts';
  } else if (currentTab.value !== 'chats') {
    currentTab.value = 'chats';
  } else {
    emit('back');
  }
}

function openSession(id: string) {
  activeChatId.value = id;
}

// F16: 自动创建或打开与联系人的闭环私聊会话
async function startChatWith(c: any) {
  const found = Object.entries(state.value?.手机?.会话 || {}).find(
    ([, v]: any) => v.类型 === '私聊' && v.参与账号id.includes(c.id) && v.参与账号id.includes(projection.value.account),
  );
  if (found) {
    activeChatId.value = found[0];
    currentTab.value = 'chats';
    actionError.value = '';
    return;
  }
  if (runtime && projection.value.account) {
    try {
      let createdId = '';
      await runtime.commit(s => {
        const opened = ensurePhoneSession(s, '私聊', c.id);
        createdId = opened.id;
        return opened.state;
      });
      activeChatId.value = createdId;
      currentTab.value = 'chats';
      actionError.value = '';
    } catch (e) {
      actionError.value = '发起会话失败：' + String(e);
    }
  } else {
    actionError.value = '离线展示不创建会话';
  }
}

async function sendImReply() {
  const chatId = activeChatId.value;
  const original = draftReply.value;
  if (!chatId || !original.trim() || isPhoneBusy.value) return;
  actionError.value = '';
  try {
    await drafts.send(draftSession.value, chatId, original);
  } catch (e) {
    const name = sessions.value.find(s => s.id === chatId)?.name || '原会话';
    actionError.value = runtime?.view.phoneRequest ? String(e) : `发送至「${name}」未完成：${String(e)}`;
  }
}

function handleReplyKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
  if (event.shiftKey) return;
  event.preventDefault();
  if (!event.repeat) void sendImReply();
}

function toggleLike(post: any) {
  action({ kind: 'like', id: post.id });
}

// F31: 替代 prompt 的内联评论与回复
const activeCommentPostId = ref<string | null>(null);
const activeReplyCommentId = ref<string | null>(null);
const inlineCommentDraft = ref('');
const isSubmittingComment = ref(false);
let inlineCommentRevision = 0;
watch([activeCommentPostId, activeReplyCommentId, inlineCommentDraft], () => { inlineCommentRevision++; }, { flush: 'sync' });

function openInlineComment(postId: string) {
  activeCommentPostId.value = postId;
  activeReplyCommentId.value = null;
  inlineCommentDraft.value = '';
}

function replyInlineTo(postId: string, commentId: string) {
  activeCommentPostId.value = postId;
  activeReplyCommentId.value = commentId;
  inlineCommentDraft.value = '';
}

async function submitInlineComment() {
  if (!inlineCommentDraft.value.trim() || !activeCommentPostId.value || isSubmittingComment.value) return;
  const postId = activeCommentPostId.value, replyTo = activeReplyCommentId.value;
  const text = inlineCommentDraft.value.trim(), revision = inlineCommentRevision;
  isSubmittingComment.value = true;
  try {
    const ok = await action({ kind: 'comment', id: postId, replyTo: replyTo ?? undefined, text });
    if (ok && revision === inlineCommentRevision) {
      activeCommentPostId.value = null;
      activeReplyCommentId.value = null;
      inlineCommentDraft.value = '';
    }
  } finally {
    isSubmittingComment.value = false;
  }
}
function handleInlineCommentKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  if (!event.repeat) void submitInlineComment();
}

function triggerNewMoment() {
  compose.value = 'post';
}

async function manage(op: string, id: string, value?: string) {
  if (!runtime) return;
  if (
    op !== 'editPost' &&
    !confirm(op === 'retract' ? '撤回本人的消息？已有阅读和认知保留。' : '删除本人的帖子？已投递的引用保留。')
  )
    return;
  try {
    await runtime.commit(s => managePhone(s, op, id, value));
    actionError.value = '';
  } catch (e) {
    actionError.value = String(e);
  }
}

function startEditPost(post: any) {
  // 简易编辑
  const val = window.prompt('编辑动态内容（原版本保留）：', post.content);
  if (val !== null && val.trim()) {
    manage('editPost', post.id, val.trim());
  }
}
</script>

<style scoped lang="scss">
.cw-app-feedback { position: absolute; z-index: 55; top: 52px; left: 10px; right: 10px; display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border: 1px solid var(--cw-border); border-radius: var(--cw-radius); background: var(--cw-bg-surface); color: var(--cw-danger); box-shadow: var(--cw-shadow-sm); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.cw-app-feedback span { flex: 1; max-height: 80px; overflow-y: auto; overflow-wrap: anywhere; }
.cw-linxin-app {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--cw-bg-main);
  overflow: hidden;
}

.cw-app-header {
  height: 48px;
  background: var(--cw-bg-surface);
  border-bottom: 1px solid var(--cw-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  user-select: none;

  .cw-header-left,
  .cw-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cw-header-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--cw-text-primary);
  }
}

.cw-btn-icon {
  background: none;
  border: none;
  color: var(--cw-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  cursor: pointer;

  &:hover {
    color: var(--cw-text-primary);
  }
}

.cw-linxin-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 消息会话列表 */
.cw-session-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;

}

.cw-session-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--cw-border);
  cursor: pointer;
  background: var(--cw-bg-surface);
  transition: background 0.15s;

  &:hover {
    background: var(--cw-bg-card-subtle);
  }

  .cw-sess-avatar {
    width: 44px;
    height: 44px;
    border-radius: var(--cw-radius);
    background: var(--cw-bg-card-subtle);
    border: 1px solid var(--cw-border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cw-text-secondary);
    position: relative;
    flex-shrink: 0;

    .cw-badge-dot {
      position: absolute;
      top: -2px;
      right: -2px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--cw-danger);
    }
  }

  .cw-sess-main {
    flex: 1;
    overflow: hidden;

    .cw-sess-top {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;

      .cw-sess-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--cw-text-primary);
      }
      .cw-sess-time {
        font-size: 11px;
        color: var(--cw-text-muted);
      }
    }

    .cw-sess-preview {
      font-size: 12px;
      color: var(--cw-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}

/* 聊天对话视口 */
.cw-chat-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--cw-bg-main);
}

.cw-chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cw-im-msg-row {
  display: flex;
  gap: 10px;

  .cw-im-avatar {
    width: 32px;
    height: 32px;
    border-radius: var(--cw-radius-full);
    background: var(--cw-bg-surface);
    border: 1px solid var(--cw-border);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .cw-im-bubble-wrap {
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-width: 78%;

    .cw-im-sender-name {
      font-size: 11px;
      color: var(--cw-text-muted);
    }

    .cw-im-bubble {
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--cw-bg-surface);
      border: 1px solid var(--cw-border);
      box-shadow: var(--cw-shadow-sm);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .cw-im-time {
      font-size: 10px;
      color: var(--cw-text-muted);
    }
  }

  &.cw-im-self {
    flex-direction: row-reverse;

    .cw-im-bubble-wrap {
      align-items: flex-end;

      .cw-im-bubble {
        background: var(--cw-accent-bg);
        border-color: var(--cw-accent-border);
      }
    }
  }
}

/* 8 类内容块样式 */
.cw-blk-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--cw-text-primary);
}

.cw-blk-image,
.cw-blk-video {
  .cw-fake-img {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-card-subtle);
    font-size: 12px;
    color: var(--cw-text-secondary);
  }
}

.cw-blk-voice {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--cw-text-primary);
}

.cw-blk-sticker {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--cw-accent);
  font-size: 12px;
}

.cw-blk-location {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);

  .cw-loc-icon {
    color: var(--cw-danger);
  }
  .cw-loc-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    .cw-loc-name {
      font-size: 12px;
      font-weight: 600;
    }
    .cw-loc-addr {
      font-size: 10px;
      color: var(--cw-text-muted);
    }
  }
}

.cw-blk-card,
.cw-blk-share {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  font-size: 12px;
}

.cw-im-status-strip {
  padding: 6px 10px;
  font-size: 11.5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid var(--cw-border);
  box-sizing: border-box;

  &.is-error {
    background: rgba(239, 68, 68, 0.08);
    color: var(--cw-danger, #ef4444);
    border-color: rgba(239, 68, 68, 0.2);
  }

  &.is-busy {
    background: var(--cw-bg-card-subtle);
    color: var(--cw-text-secondary);
  }

  .cw-im-status-info {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .cw-im-status-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cw-im-status-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
}

.cw-chat-bottom-input {
  padding: 6px 8px;
  background: var(--cw-bg-surface);
  border-top: 1px solid var(--cw-border);
  display: flex;
  align-items: flex-end;
  gap: 6px;
  box-sizing: border-box;
  width: 100%;

  .cw-im-more-btn {
    flex-shrink: 0;
    height: 32px;
    padding: 0 6px;
    font-size: 11px;
  }

  .cw-im-textarea {
    flex: 1;
    min-width: 0;
    min-height: 32px;
    max-height: 72px;
    padding: 6px 8px;
    border-radius: var(--cw-radius);
    border: 1px solid var(--cw-border);
    background: var(--cw-bg-input);
    color: var(--cw-text-primary);
    font-size: 12.5px;
    line-height: 1.4;
    resize: none;
    outline: none;
    box-sizing: border-box;
    font-family: inherit;

    &:focus {
      border-color: var(--cw-accent, #07c160);
    }
  }

  .cw-im-send-btn {
    flex-shrink: 0;
    min-width: 52px;
    height: 32px;
    padding: 0 10px;
    font-size: 12px;
    white-space: nowrap;
  }
}

/* ================= 通讯录 (全新现代化微信/IM风格) ================= */
.cw-contacts-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--cw-bg-main, #f8fafc);
  display: flex;
  flex-direction: column;
}

/* 顶部搜索框 */
.cw-contacts-search-wrap {
  padding: 8px 12px;
  background: var(--cw-bg-surface);
  border-bottom: 1px solid var(--cw-border);
  position: sticky;
  top: 0;
  z-index: 10;

  .cw-contacts-search-box {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;

    .cw-contacts-search-icon {
      position: absolute;
      left: 10px;
      color: var(--cw-text-muted);
      pointer-events: none;
    }

    .cw-contacts-search-input {
      width: 100%;
      height: 32px;
      padding: 4px 28px 4px 30px;
      border-radius: 16px;
      border: 1px solid var(--cw-border);
      background: var(--cw-bg-input, var(--cw-bg-surface));
      color: var(--cw-text-primary);
      font-size: 12px;
      outline: none;
      transition: all 0.2s ease;

      &:focus {
        border-color: #07c160;
        box-shadow: 0 0 0 2px rgba(7, 193, 96, 0.15);
      }
    }

    .cw-contacts-clear-btn {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      color: var(--cw-text-muted);
      font-size: 16px;
      cursor: pointer;
      line-height: 1;
      padding: 2px 4px;
      &:hover { color: var(--cw-text-primary); }
    }
  }
}

/* 快捷入口卡片组 */
.cw-contact-action-grid {
  display: flex;
  flex-direction: column;
  background: var(--cw-bg-surface);
  border-bottom: 1px solid var(--cw-border);

  .cw-contact-action-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--cw-border-subtle, rgba(0, 0, 0, 0.04));
    cursor: pointer;
    transition: background 0.15s ease;

    &:last-child { border-bottom: none; }
    &:hover { background: var(--cw-bg-card-subtle); }

    .cw-action-icon-badge {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      flex-shrink: 0;

      &.badge-orange { background: linear-gradient(135deg, #fa8c16, #fa541c); }
      &.badge-green { background: linear-gradient(135deg, #07c160, #10b981); }
    }

    .cw-action-text-col {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .cw-action-title {
        font-size: 13.5px;
        font-weight: 600;
        color: var(--cw-text-primary);
      }
      .cw-action-desc {
        font-size: 11px;
        color: var(--cw-text-muted);
      }
    }

    .cw-action-arrow {
      color: var(--cw-text-muted);
      opacity: 0.6;
    }
  }
}

/* 分组标题与统计 */
.cw-contacts-section-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 600;
  color: var(--cw-text-muted);
  background: transparent;

  .cw-search-matching-tip {
    color: #07c160;
    font-weight: 500;
  }
}

/* 联系人卡片流 */
.cw-contacts-cards-stream {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--cw-bg-surface);
  border-top: 1px solid var(--cw-border);
  border-bottom: 1px solid var(--cw-border);

  .cw-contact-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--cw-border-subtle, rgba(0, 0, 0, 0.04));
    cursor: pointer;
    transition: all 0.15s ease;

    &:last-child { border-bottom: none; }
    &:hover { background: var(--cw-bg-card-subtle); }

    .cw-contact-avatar-wrap {
      flex-shrink: 0;
    }

    .cw-contact-main-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;

      .cw-contact-name-row {
        display: flex;
        align-items: center;
        gap: 6px;

        .cw-contact-display-name {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--cw-text-primary);
        }
      }

      .cw-contact-sub-text {
        font-size: 11px;
        color: var(--cw-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .cw-contact-quick-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;

      .cw-contact-action-btn {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--cw-border);
        background: var(--cw-bg-surface);
        color: var(--cw-text-secondary);
        cursor: pointer;
        transition: all 0.15s ease;

        &.btn-chat:hover {
          background: #07c160;
          border-color: #07c160;
          color: #fff;
        }

        &.btn-profile:hover {
          background: var(--cw-accent, #0284c7);
          border-color: var(--cw-accent, #0284c7);
          color: #fff;
        }
      }
    }
  }
}

.cw-contact-no-match {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 36px 16px;
  color: var(--cw-text-muted);
  font-size: 12px;

  .cw-no-match-icon { opacity: 0.4; }
}

/* ================= 朋友圈 (全新现代化微信社交流) ================= */
.cw-moments-view {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--cw-bg-surface);
  display: flex;
  flex-direction: column;
}

/* 顶部都会流光封面 */
.cw-moments-hero-cover {
  height: 140px;
  background: linear-gradient(135deg, #1e3a8a 0%, #312e81 40%, #065f46 100%);
  position: relative;
  margin-bottom: 38px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

  .cw-cover-gradient-layer {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.15) 0%, transparent 60%);
    pointer-events: none;
  }

  .cw-btn-post-camera {
    position: absolute;
    top: 12px;
    right: 14px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.4);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.35);
      transform: scale(1.05);
    }
  }

  .cw-cover-user-card {
    position: absolute;
    bottom: -24px;
    right: 14px;
    display: flex;
    align-items: flex-end;
    gap: 12px;

    .cw-user-texts {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 3px;
      margin-bottom: 8px;

      .cw-user-name {
        font-size: 15px;
        font-weight: 700;
        color: #ffffff;
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.75);
      }

      .cw-user-motto {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.9);
        background: rgba(0, 0, 0, 0.35);
        backdrop-filter: blur(6px);
        padding: 1px 8px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        max-width: 180px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .cw-user-avatar-frame {
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
      border-radius: var(--cw-radius);
      border: 2.5px solid #ffffff;
      background: var(--cw-bg-surface);
      flex-shrink: 0;
    }
  }
}

.cw-moments-list {
  display: flex;
  flex-direction: column;
}

.cw-moment-item {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--cw-border);
  transition: background 0.15s ease;

  &:hover {
    background: var(--cw-bg-card-subtle, rgba(0, 0, 0, 0.01));
  }

  .cw-moment-avatar-col {
    flex-shrink: 0;
  }

  .cw-moment-content-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;

    .cw-moment-author-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;

      .cw-moment-author-name {
        font-size: 13.5px;
        font-weight: 700;
        color: #576b95;
        cursor: pointer;

        &:hover { text-decoration: underline; }
      }

      .cw-author-role-badge {
        font-size: 10.5px;
        padding: 1px 6px;
        border-radius: 4px;
        background: var(--cw-bg-card-subtle);
        border: 1px solid var(--cw-border);
        color: var(--cw-text-secondary);
      }
    }

    .cw-moment-body-text {
      margin: 0;
      font-size: 13.5px;
      color: var(--cw-text-primary);
      line-height: 1.55;
      word-break: break-word;
    }

    /* 多图相册与九宫格 */
    .cw-moment-gallery {
      display: grid;
      gap: 6px;
      margin-top: 4px;

      &[data-count='1'],
      &.gallery-count-1 {
        grid-template-columns: minmax(0, 240px);
      }
      &[data-count='2'],
      &[data-count='4'],
      &.gallery-count-2,
      &.gallery-count-4 {
        grid-template-columns: repeat(2, minmax(0, 110px));
      }
      &[data-count='3'],
      &[data-count='5'],
      &[data-count='6'],
      &[data-count='7'],
      &[data-count='8'],
      &[data-count='9'],
      &.gallery-count-3,
      &.gallery-count-5,
      &.gallery-count-6,
      &.gallery-count-7,
      &.gallery-count-8,
      &.gallery-count-9 {
        grid-template-columns: repeat(3, minmax(0, 85px));
      }

      .cw-gallery-photo-card {
        aspect-ratio: 1;
        border-radius: var(--cw-radius-sm);
        border: 1px solid var(--cw-border);
        background: linear-gradient(135deg, var(--cw-bg-surface) 0%, var(--cw-bg-card-subtle) 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 6px;
        text-align: center;
        box-shadow: var(--cw-shadow-sm);
        cursor: pointer;
        transition: transform 0.15s ease;

        &:hover {
          transform: scale(1.02);
          border-color: #07c160;
        }

        .cw-photo-bg-pattern {
          color: var(--cw-text-muted);
          opacity: 0.7;
        }

        .cw-photo-label {
          font-size: 10px;
          color: var(--cw-text-secondary);
          line-height: 1.2;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      }
    }

    /* 底部元数据栏 */
    .cw-moment-meta-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 4px;

      .cw-meta-left {
        display: flex;
        align-items: center;
        gap: 8px;

        .cw-moment-timestamp {
          font-size: 11px;
          color: var(--cw-text-muted);
        }

        .cw-link-subtle {
          background: none;
          border: none;
          padding: 0;
          font-size: 11px;
          color: #576b95;
          cursor: pointer;

          &:hover { text-decoration: underline; }
          &.cw-link-danger { color: var(--cw-danger); }
        }
      }

      .cw-meta-actions {
        display: flex;
        align-items: center;
        gap: 8px;

        .cw-moment-action-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          border-radius: 12px;
          border: 1px solid var(--cw-border);
          background: var(--cw-bg-card-subtle);
          color: var(--cw-text-secondary);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s ease;

          &:hover {
            background: var(--cw-bg-surface);
            border-color: #07c160;
            color: #07c160;
          }

          &.is-liked {
            color: #ef4444;
            border-color: rgba(239, 68, 68, 0.4);
            background: rgba(239, 68, 68, 0.06);
          }
        }
      }
    }

    /* 内联评论回复框 */
    .cw-inline-comment-box {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 6px;
      padding: 6px 8px;
      border-radius: var(--cw-radius-sm);
      background: var(--cw-bg-card-subtle);
      border: 1px solid var(--cw-border);

      .cw-inline-input {
        flex: 1;
        min-width: 0;
        height: 28px;
        padding: 0 8px;
        font-size: 12px;
        border-radius: 4px;
        border: 1px solid var(--cw-border);
        background: var(--cw-bg-surface);
        color: var(--cw-text-primary);
        outline: none;

        &:focus { border-color: #07c160; }
      }
    }

    /* 气泡式点赞评论区 */
    .cw-moment-interaction-bubble {
      margin-top: 6px;
      padding: 8px 10px;
      border-radius: 6px;
      background: var(--cw-bg-card-subtle);
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;

      &::before {
        content: "";
        position: absolute;
        top: -5px;
        left: 14px;
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-bottom: 5px solid var(--cw-bg-card-subtle);
      }

      .cw-bubble-likes-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding-bottom: 4px;
        border-bottom: 1px solid var(--cw-border-subtle, rgba(0, 0, 0, 0.05));
        color: #576b95;
        font-weight: 500;

        .cw-like-icon { color: #ef4444; flex-shrink: 0; }
        .cw-like-names { flex: 1; min-width: 0; }
      }

      .cw-bubble-comments-col {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
    }
  }
}

/* 底部 Tab */
.cw-linxin-bottom-tabs {
  height: 48px;
  border-top: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  display: flex;
  align-items: center;
  justify-content: space-around;

  .cw-app-tab-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    background: none;
    border: none;
    color: var(--cw-text-muted);
    font-size: 10px;
    cursor: pointer;

    &.active {
      color: #07c160;
      font-weight: 600;
    }
  }
}

.cw-no-account-card {
  padding: 14px;
  margin: 12px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card);
  border: 1px dashed var(--cw-border-hover);
  display: flex;
  flex-direction: column;
  gap: 6px;

  .cw-no-acc-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--cw-accent);
  }
  .cw-no-acc-desc {
    margin: 0;
    font-size: 12px;
    color: var(--cw-text-secondary);
    line-height: 1.4;
  }
}

.cw-applications-view {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  background: var(--cw-bg-main);

  .cw-apps-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* 顶部快捷切换 Tabs */
  .cw-apps-nav-tabs {
    display: flex;
    background: var(--cw-bg-card-subtle);
    padding: 3px;
    border-radius: var(--cw-radius-full);
    border: 1px solid var(--cw-border);
    gap: 4px;

    .cw-apps-tab-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 7px 8px;
      border: none;
      border-radius: var(--cw-radius-full);
      background: transparent;
      font-size: 11.5px;
      color: var(--cw-text-secondary);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

      &:hover {
        color: var(--cw-text-primary);
      }

      &.active {
        background: var(--cw-bg-surface);
        color: #07c160;
        font-weight: 600;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      }

      .cw-apps-counter-badge {
        font-size: 10px;
        padding: 0 5px;
        border-radius: 9px;
        background: #ef4444;
        color: #fff;
        font-weight: 700;
        line-height: 14px;
      }
    }
  }

  .cw-apps-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .cw-section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .cw-section-subtitle {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--cw-text-primary);
      margin: 0;
    }

    .cw-btn-quick-add-link {
      background: none;
      border: none;
      color: #07c160;
      font-size: 11.5px;
      cursor: pointer;
      font-weight: 500;
      &:hover { text-decoration: underline; }
    }
  }

  .cw-apps-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cw-app-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: var(--cw-radius, 10px);
    background: var(--cw-bg-surface);
    border: 1px solid var(--cw-border);
    box-shadow: var(--cw-shadow-sm);
    transition: all 0.15s ease;

    &:hover {
      border-color: rgba(7, 193, 96, 0.3);
    }

    &.is-pending {
      border-left: 3px solid #07c160;
    }

    .cw-app-avatar-wrap {
      position: relative;
      flex-shrink: 0;

      .cw-app-dir-badge {
        position: absolute;
        bottom: -2px;
        right: -2px;
        font-size: 9px;
        width: 14px;
        height: 14px;
        border-radius: 7px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-weight: 700;
        border: 1.5px solid var(--cw-bg-surface);

        &.badge-in { background: #07c160; }
        &.badge-out { background: #3b82f6; }
      }
    }

    .cw-app-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;

      .cw-app-name-row {
        display: flex;
        align-items: center;
        gap: 6px;

        .cw-app-name {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--cw-text-primary);
        }

        .cw-app-status-pill {
          font-size: 10px;
          padding: 1px 6px;
          border-radius: var(--cw-radius-full);
          background: var(--cw-bg-card-subtle);
          color: var(--cw-text-muted);

          &[data-status='待处理'],
          &.status-待处理 {
            color: #d97706;
            background: rgba(245, 158, 11, 0.1);
            border: 1px solid rgba(245, 158, 11, 0.2);
          }
          &[data-status='接受'] {
            color: #07c160;
            background: rgba(7, 193, 96, 0.1);
            border: 1px solid rgba(7, 193, 96, 0.2);
          }
        }
      }

      .cw-app-note-bubble {
        display: flex;
        align-items: flex-start;
        gap: 2px;
        font-size: 11.5px;
        color: var(--cw-text-secondary);

        .cw-quote-mark {
          color: var(--cw-text-muted);
          font-weight: 700;
        }

        .cw-note-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 170px;
        }
      }
    }

    .cw-app-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;

      .cw-app-btn-pass {
        background: #07c160;
        border: none;
        color: #fff;
        font-weight: 600;
        border-radius: var(--cw-radius-full);
        padding: 3px 10px;

        &:hover { background: #06ad56; }
      }

      .cw-app-btn-reject,
      .cw-app-btn-withdraw {
        border-radius: var(--cw-radius-full);
        padding: 3px 8px;
        font-size: 11px;
      }

      .cw-app-settled-text {
        font-size: 11px;
        color: var(--cw-text-muted);
      }
    }
  }

  /* 添加新朋友 Hero 卡片 */
  .cw-add-friend-hero-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: var(--cw-radius);
    background: linear-gradient(135deg, rgba(7, 193, 96, 0.08) 0%, rgba(7, 193, 96, 0.02) 100%);
    border: 1px solid rgba(7, 193, 96, 0.2);

    .cw-add-hero-icon {
      width: 40px;
      height: 40px;
      border-radius: var(--cw-radius-full);
      background: #07c160;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .cw-add-hero-text {
      flex: 1;

      .cw-add-hero-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--cw-text-primary);
        margin: 0 0 2px 0;
      }
      .cw-add-hero-desc {
        font-size: 11px;
        color: var(--cw-text-muted);
        margin: 0;
        line-height: 1.4;
      }
    }
  }

  /* 添加朋友表单卡片 */
  .cw-add-friend-interactive-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    border-radius: var(--cw-radius);
    background: var(--cw-bg-surface);
    border: 1px solid var(--cw-border);
    box-shadow: var(--cw-shadow-sm);

    .cw-add-form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;

      .cw-add-field-label {
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        font-weight: 600;
        color: var(--cw-text-secondary);
      }

      .cw-label-with-presets {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 4px;
      }

      .cw-preset-chips {
        display: flex;
        gap: 4px;
        overflow-x: auto;

        .cw-preset-chip {
          background: var(--cw-bg-card-subtle);
          border: 1px solid var(--cw-border);
          border-radius: var(--cw-radius-full);
          padding: 1px 7px;
          font-size: 10.5px;
          color: #07c160;
          white-space: nowrap;
          cursor: pointer;

          &:hover {
            background: rgba(7, 193, 96, 0.1);
            border-color: #07c160;
          }
        }
      }

      .cw-candidate-chips-scroll {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow-x: auto;
        padding-bottom: 2px;
        scrollbar-width: none;
        &::-webkit-scrollbar { display: none; }

        .cw-candidate-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px 3px 4px;
          border-radius: var(--cw-radius-full);
          border: 1px solid var(--cw-border);
          background: var(--cw-bg-card-subtle);
          color: var(--cw-text-secondary);
          font-size: 11.5px;
          white-space: nowrap;
          cursor: pointer;
          transition: all 0.15s ease;

          .cw-candidate-name {
            max-width: 80px;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          &:hover {
            border-color: #07c160;
            color: var(--cw-text-primary);
          }

          &.active {
            border-color: #07c160;
            background: rgba(7, 193, 96, 0.08);
            color: #07c160;
            font-weight: 600;
          }
        }
      }
    }

    .cw-btn-send-apply {
      height: 38px;
      font-size: 13.5px;
      font-weight: 600;
      background: #07c160;
      border: none;
      color: #fff;
      border-radius: var(--cw-radius);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;

      &:not(:disabled):hover {
        background: #06ad56;
        box-shadow: 0 3px 10px rgba(7, 193, 96, 0.3);
      }
    }
  }

  /* 引导卡片 */
  .cw-no-known-guide-card {
    padding: 24px 16px;
    border-radius: var(--cw-radius);
    background: var(--cw-bg-surface);
    border: 1px dashed var(--cw-border-hover);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 8px;

    .cw-guide-icon-wrap {
      color: var(--cw-text-muted);
      opacity: 0.6;
    }
    .cw-guide-title {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--cw-text-primary);
      margin: 0;
    }
    .cw-guide-desc {
      font-size: 11.5px;
      color: var(--cw-text-muted);
      line-height: 1.5;
      margin: 0;
      max-width: 260px;
    }
  }
}

.cw-inline-comment-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px;
  border-radius: var(--cw-radius);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
}

.cw-empty-sub {
  font-size: 12px;
  color: var(--cw-text-muted);
  text-align: center;
  padding: 16px 10px;
}

.cw-empty-backdrop {
  flex: 1 0 auto;
  width: 100%;
  min-height: 0;
  box-sizing: border-box;
  margin: 0;
  padding: 32px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  border: none;
  border-radius: 0;
  background: transparent;

  .cw-empty-graphic {
    color: var(--cw-text-muted);
    opacity: 0.35;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cw-empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--cw-text-secondary);
    margin-bottom: 6px;
  }

  .cw-empty-desc {
    font-size: 12px;
    color: var(--cw-text-muted);
    line-height: 1.6;
    max-width: 260px;
  }

  .cw-empty-action {
    margin-top: 14px;
  }
}

.cw-empty-compact {
  width: 100%;
  padding: 12px 14px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: var(--cw-text-muted);
  font-size: 12px;

  .cw-empty-icon {
    opacity: 0.5;
    flex-shrink: 0;
  }
}

[data-theme='dark'] {
  .cw-contacts-list {
    background: #0f172a;
  }
  .cw-contacts-cards-stream {
    background: var(--cw-bg-card);
  }
  .cw-contact-action-grid {
    background: var(--cw-bg-card);
  }
  .cw-moments-hero-cover {
    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #064e3b 100%);
  }
  .cw-moment-interaction-bubble {
    background: rgba(255, 255, 255, 0.05);
    &::before {
      border-bottom-color: rgba(255, 255, 255, 0.05);
    }
  }
  .cw-gallery-photo-card {
    background: rgba(255, 255, 255, 0.03);
  }
  .cw-applications-view {
    background: #0f172a;
    .cw-apps-nav-tabs {
      background: rgba(255, 255, 255, 0.04);
      .cw-apps-tab-btn.active {
        background: rgba(255, 255, 255, 0.08);
        color: #10b981;
      }
    }
    .cw-app-card,
    .cw-add-friend-interactive-card,
    .cw-no-known-guide-card {
      background: var(--cw-bg-card);
    }
  }
}
</style>
