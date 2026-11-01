<template>
  <section class="cw-directory">
    <!-- 顶部操作反馈通知条 -->
    <transition name="cw-fade">
      <div v-if="feedback" class="cw-directory-feedback-banner" :class="{ 'is-error': feedbackError }" :role="feedbackError ? 'alert' : 'status'">
        <SvgIcon :name="feedbackError ? 'alertCircle' : 'checkCircle'" :size="14" />
        <span>{{ feedback }}</span>
        <button type="button" class="cw-btn-close-fb" title="关闭" @click="feedback = ''">×</button>
      </div>
    </transition>

    <!-- TAB 1: 联系人设置与资料 -->
    <div v-if="mode === 'contacts'" class="cw-directory-content">
      <!-- 快速联系人选择流 -->
      <div v-if="contacts.length > 0" class="cw-contact-quick-picker">
        <div class="cw-picker-label">
          <SvgIcon name="users" :size="13" />
          <span>选择联系人 ({{ contacts.length }})</span>
        </div>
        <div class="cw-contacts-pill-scroll">
          <button
            v-for="[id, c] in contacts"
            :key="id"
            type="button"
            class="cw-contact-nav-chip"
            :class="{ active: selectedContact === id }"
            @click="selectedContact = id"
          >
            <CharacterAvatar :name="name(c.对方账号id)" :size="24" shape="rounded" />
            <span class="cw-chip-name">{{ name(c.对方账号id) }}</span>
            <span v-if="c.免打扰" class="cw-chip-badge mute" title="已免打扰">🔕</span>
            <span v-if="c.状态 === '拉黑'" class="cw-chip-badge block" title="已屏蔽">🚫</span>
          </button>
        </div>
      </div>

      <!-- 选中联系人资料主卡片 -->
      <article v-if="contact && account" class="cw-profile-detail-card">
        <!-- 头部个人形象与身份信息 -->
        <div class="cw-profile-hero">
          <div class="cw-profile-avatar-wrap">
            <CharacterAvatar :name="name(contact.对方账号id)" :size="54" shape="rounded" />
            <span
              class="cw-status-indicator"
              :class="{
                'is-muted': contact.免打扰,
                'is-blocked': contact.状态 === '拉黑',
                'is-normal': !contact.免打扰 && contact.状态 !== '拉黑'
              }"
              :title="contact.状态"
            ></span>
          </div>

          <div class="cw-profile-hero-info">
            <div class="cw-hero-title-row">
              <strong class="cw-profile-name">{{ name(contact.对方账号id) }}</strong>
              <span
                v-if="contactRoleInfo.tier"
                class="cw-badge cw-badge-xs"
                :class="contactRoleInfo.tier === '主要' ? 'cw-badge-accent' : 'cw-badge-subtle'"
              >
                {{ contactRoleInfo.tier }}
              </span>
            </div>
            <div class="cw-profile-handle">邻信号: @{{ contact.对方账号id }}</div>
            <div class="cw-profile-tags-row">
              <span class="cw-status-badge" :data-status="contact.状态">{{ contact.状态 }}</span>
              <span v-if="contact.免打扰" class="cw-status-badge badge-warning">消息已静音</span>
              <span v-if="contactRoleInfo.identity" class="cw-identity-pill">{{ contactRoleInfo.identity }}</span>
            </div>
          </div>
        </div>

        <!-- 快速发消息主按钮 -->
        <div class="cw-profile-primary-action">
          <button
            type="button"
            class="cw-btn cw-btn-primary cw-chat-lead-btn"
            title="打开与该联系人的聊天窗口"
            @click="emitChat(contact.对方账号id)"
          >
            <SvgIcon name="messageSquare" :size="16" />
            <span>发消息</span>
          </button>
        </div>

        <!-- 联系人的公开资料 -->
        <div v-if="publicInfoEntries.length" class="cw-info-section">
          <div class="cw-section-head">
            <SvgIcon name="user" :size="13" />
            <span>公开资料</span>
          </div>
          <div v-if="publicInfoEntries.length > 0" class="cw-public-data-grid">
            <div v-for="[key, value] in publicInfoEntries" :key="key" class="cw-data-cell">
              <span class="cw-data-key">{{ key }}</span>
              <span class="cw-data-val">{{ value ?? '保密' }}</span>
            </div>
          </div>
        </div>

        <!-- 备注名修改卡片 -->
        <div class="cw-info-section">
          <div class="cw-section-head">
            <SvgIcon name="edit" :size="13" />
            <span>设置备注名</span>
          </div>
          <div class="cw-remark-input-row">
            <input
              v-model="remarkDraft"
              class="cw-dir-input"
              placeholder="添加朋友备注名 (留空清空备注)..."
            />
            <button
              type="button"
              class="cw-btn cw-btn-sm"
              :class="{ 'cw-btn-primary': isRemarkModified, 'cw-btn-ghost': !isRemarkModified }"
              :disabled="busy || !isRemarkModified"
              @click="run('remark', selectedContact, remarkDraft)"
            >
              {{ busy ? '保存中…' : '保存备注' }}
            </button>
          </div>
        </div>

        <!-- 聊天与通知偏好控制项 -->
        <div class="cw-info-section">
          <div class="cw-section-head">
            <SvgIcon name="settings" :size="13" />
            <span>偏好设置与安全控制</span>
          </div>

          <div class="cw-settings-menu-list">
            <!-- 消息免打扰行 -->
            <button type="button" class="cw-setting-menu-row" role="switch" :aria-checked="contact.免打扰" :disabled="busy" @click="run('mute', selectedContact)">
              <span class="cw-setting-label-col">
                <span class="cw-setting-title">消息免打扰</span>
                <span class="cw-setting-desc">收到消息时不主动弹窗或发出通知提示</span>
              </span>
              <span
                class="cw-toggle-switch"
                :class="{ active: contact.免打扰 }"
                aria-hidden="true"
              >
                <span class="cw-toggle-thumb"></span>
              </span>
            </button>

            <!-- 屏蔽 / 黑名单行 -->
            <button type="button" class="cw-setting-menu-row" role="switch" :aria-checked="contact.状态 === '拉黑'" :disabled="busy || contact.状态 === '移除'" @click="run('block', selectedContact)">
              <span class="cw-setting-label-col">
                <span class="cw-setting-title">加入黑名单 (屏蔽)</span>
                <span class="cw-setting-desc">屏蔽私聊和好友申请，共同群聊中的消息仍可见</span>
              </span>
              <span
                class="cw-toggle-switch switch-danger"
                :class="{ active: contact.状态 === '拉黑' }"
                aria-hidden="true"
              >
                <span class="cw-toggle-thumb"></span>
              </span>
            </button>
          </div>
        </div>

        <!-- 危险区域：移除好友 -->
        <div class="cw-danger-section">
          <button
            type="button"
            class="cw-btn cw-btn-danger-outline cw-btn-block"
            :disabled="busy || contact.状态 === '移除'"
            @click="ask('remove', selectedContact, `确定解除与「${name(contact.对方账号id)}」的邻信好友关系？已有聊天记录仍会保留在本地。`)"
          >
            <SvgIcon name="trash" :size="14" />
            <span>删除联系人</span>
          </button>
        </div>
      </article>

      <!-- 未添加联系人或未选中空态 -->
      <div v-else-if="!contacts.length" class="cw-empty-backdrop">
        <div class="cw-empty-icon-wrap">
          <SvgIcon name="users" :size="38" />
        </div>
        <div class="cw-empty-title">暂无邻信联系人</div>
        <div class="cw-empty-desc">尚未添加任何街坊好友，请通过「新的朋友」申请结识邻里。</div>
      </div>
      <div v-else class="cw-empty-backdrop">
        <div class="cw-empty-icon-wrap">
          <SvgIcon name="userCheck" :size="38" />
        </div>
        <div class="cw-empty-title">请选择联系人</div>
        <div class="cw-empty-desc">在上方滑动选择一位联系人，以查看详情资料或调整备注与消息设置。</div>
      </div>
    </div>

    <!-- TAB 2: 群聊资料、成员管理与入群邀约 -->
    <div v-else class="cw-directory-content">
      <!-- 模式切换：我加入的群聊 vs 发起新邀约 -->
      <div class="cw-group-subtabs">
        <button
          type="button"
          class="cw-subtab-btn"
          :class="{ active: groupSubTab === 'joined' }"
          @click="groupSubTab = 'joined'"
        >
          <SvgIcon name="users" :size="13" />
          <span>群聊资料与成员 ({{ groups.length }})</span>
        </button>
        <button
          type="button"
          class="cw-subtab-btn"
          :class="{ active: groupSubTab === 'invite' }"
          @click="openInvite()"
        >
          <SvgIcon name="userPlus" :size="13" />
          <span>发起入群邀约</span>
        </button>
      </div>

      <!-- 子视图 A: 我加入的群聊 -->
      <template v-if="groupSubTab === 'joined'">
        <!-- 群选择器 -->
        <div v-if="groups.length > 0" class="cw-group-selector-box">
          <label class="cw-group-select-label">切换当前群聊:</label>
          <select v-model="selectedGroup" class="cw-dir-select">
            <option value="">-- 选择已加入的群聊 --</option>
            <option v-for="[id, g] in groups" :key="id" :value="id">
              {{ g.名称 || '未命名群聊' }} ({{ Object.values(g.成员 || {}).filter(currentMember).length }}人)
            </option>
          </select>
        </div>

        <article v-if="group" class="cw-group-detail-card">
          <!-- 群头部概览 -->
          <div class="cw-group-hero">
            <div class="cw-group-avatar-badge">
              <SvgIcon name="users" :size="24" />
            </div>
            <div class="cw-group-hero-info">
              <div class="cw-group-name-row">
                <h4 class="cw-group-name">{{ group.名称 || '未命名群聊' }}</h4>
                <span class="cw-badge cw-badge-subtle cw-badge-xs">共 {{ members.length }} 位成员</span>
              </div>
              <div class="cw-group-role-tag">
                <span v-if="group.创建者账号id === self" class="cw-role-chip owner">群主</span>
                <span v-else-if="group.管理员账号id?.includes(self)" class="cw-role-chip admin">管理员</span>
                <span v-else class="cw-role-chip member">成员</span>
              </div>
            </div>
          </div>

          <!-- 进入群聊主按钮 -->
          <div class="cw-profile-primary-action">
            <button
              type="button"
              class="cw-btn cw-btn-primary cw-chat-lead-btn"
              title="打开该群聊会话窗口"
              @click="emitGroupChat(selectedGroup)"
            >
              <SvgIcon name="messageSquare" :size="16" />
              <span>进入群聊</span>
            </button>
          </div>

          <!-- 群公告卡片 -->
          <div class="cw-info-section">
            <div class="cw-section-head">
              <SvgIcon name="bell" :size="13" />
              <span>群公告</span>
            </div>
            <div class="cw-notice-card">
              <p class="cw-notice-body">{{ group.公告 || '本群暂未发布群公告。' }}</p>
            </div>
          </div>

          <!-- 群成员名录与管理矩阵 -->
          <div class="cw-info-section">
            <div class="cw-section-head">
              <SvgIcon name="users" :size="13" />
              <span>群成员 ({{ members.length }})</span>
              <button
                type="button"
                class="cw-link-add-member"
                title="邀请新好友入群"
                @click="openInvite(selectedGroup)"
              >
                + 邀请入群
              </button>
            </div>

            <div class="cw-members-grid">
              <div
                v-for="[id, member] in members"
                :key="id"
                class="cw-member-tile"
                :class="{ 'is-me': id === self }"
              >
                <div class="cw-member-avatar-wrap">
                  <CharacterAvatar :name="member.群昵称 || name(id)" :size="34" shape="rounded" />
                  <span v-if="id === group.创建者账号id" class="cw-member-role-mark owner" title="群主">👑</span>
                  <span v-else-if="group.管理员账号id?.includes(id)" class="cw-member-role-mark admin" title="管理员">🛡️</span>
                </div>

                <div class="cw-member-tile-info">
                  <span class="cw-member-tile-name" :title="member.群昵称 || name(id)">
                    {{ member.群昵称 || name(id) }}
                  </span>
                  <span v-if="id === self" class="cw-me-indicator">我</span>
                </div>

                <!-- 管理员移除成员操作 -->
                <button
                  v-if="canRemoveMember(id)"
                  type="button"
                  class="cw-btn-remove-member"
                  title="移出本群"
                  :disabled="busy"
                  @click="ask('removeMember', selectedGroup, `将「${name(id)}」移出本群？`, id)"
                >
                  ×
                </button>
              </div>

              <!-- 快捷入群邀请卡片 -->
              <button type="button" class="cw-member-tile add-tile" @click="openInvite(selectedGroup)">
                <div class="cw-add-member-circle">
                  <SvgIcon name="plus" :size="16" />
                </div>
                <span class="cw-add-member-text">邀请好友</span>
              </button>
            </div>
          </div>

          <!-- 退出群聊危险操作 -->
          <div class="cw-danger-section">
            <button
              type="button"
              class="cw-btn cw-btn-danger-outline cw-btn-block"
              :disabled="busy || !canLeaveGroup"
              :title="canLeaveGroup ? '退出当前群聊' : '请先转交群主后再退出'"
              @click="ask('leaveGroup', selectedGroup, `确定退出群聊「${group.名称 || '当前群聊'}」？本地历史记录仍会保留。`)"
            >
              <SvgIcon name="trash" :size="14" />
              <span>退出群聊</span>
            </button>
            <p v-if="!canLeaveGroup" class="cw-setting-desc">群内还有其他成员，请先转交群主后再退出。</p>
          </div>
        </article>

        <!-- 未加入群聊空态 -->
        <div v-else-if="!groups.length" class="cw-empty-backdrop">
          <div class="cw-empty-icon-wrap">
            <SvgIcon name="messageSquare" :size="38" />
          </div>
          <div class="cw-empty-title">暂未加入任何群聊</div>
          <div class="cw-empty-desc">尚未加入都市街坊群聊，可切换到「发起入群邀约」邀请邻里一同组建群组。</div>
          <button type="button" class="cw-btn cw-btn-primary cw-btn-sm cw-empty-action" @click="openInvite()">
            发起建群邀约
          </button>
        </div>
        <div v-else class="cw-empty-backdrop">
          <div class="cw-empty-icon-wrap">
            <SvgIcon name="users" :size="38" />
          </div>
          <div class="cw-empty-title">未选择群聊</div>
          <div class="cw-empty-desc">请在上方下拉列表中选择一个群聊，以查看成员名册与群公告。</div>
        </div>
      </template>

      <!-- 子视图 B: 发起建群或入群邀约 -->
      <article v-else class="cw-invite-form-card">
        <div class="cw-invite-header">
          <div class="cw-invite-icon-badge">
            <SvgIcon name="userPlus" :size="20" />
          </div>
          <div class="cw-invite-header-info">
            <h4 class="cw-invite-title">发起建群或入群邀约</h4>
            <p class="cw-invite-desc">通过私聊征求好友意愿，同意后由剧情确认建群或入群。</p>
          </div>
        </div>

        <div class="cw-invite-form-group">
          <label class="cw-form-label">邀约目标</label>
          <select v-model="inviteGroup" class="cw-dir-select cw-invite-target-select" :disabled="busy">
            <option value="">一起创建新群聊</option>
            <option v-for="[id, g] in groups" :key="id" :value="id">加入「{{ g.名称 || '未命名群聊' }}」</option>
          </select>
        </div>
        <div v-if="!inviteGroup" class="cw-invite-form-group">
          <label class="cw-form-label">建群名称</label>
          <input v-model="newGroupName" class="cw-dir-input cw-invite-name-input" placeholder="为新群聊取一个名字" :disabled="busy" />
        </div>

        <!-- 选择受邀联系人 -->
        <div class="cw-invite-form-group">
          <label class="cw-form-label">
            <SvgIcon name="user" :size="13" />
            <span>受邀联系人（已选 {{ inviteAccounts.length }} 人）</span>
          </label>
          <input v-model="inviteQuery" class="cw-dir-input cw-invite-name-input" placeholder="搜索好友昵称、备注或账号" aria-label="搜索受邀联系人" />
          <div class="cw-invite-contact-list" role="group" aria-label="多选受邀联系人">
            <label v-for="[id, c] in filteredInviteContacts" :key="id" class="cw-invite-contact-option" :class="{ selected: inviteAccounts.includes(c.对方账号id) }">
              <input v-model="inviteAccounts" type="checkbox" :value="c.对方账号id" :disabled="busy" />
              <CharacterAvatar :name="c.备注 || name(c.对方账号id)" :size="32" shape="rounded" />
              <span>{{ c.备注 || name(c.对方账号id) }}</span>
            </label>
            <p v-if="!filteredInviteContacts.length" class="cw-setting-desc">{{ inviteQuery ? '没有匹配的可邀请好友' : '暂无可邀请好友，已在目标群中的成员不会重复显示' }}</p>
          </div>
        </div>

        <!-- 邀约说明 -->
        <div class="cw-invite-form-group">
          <div class="cw-form-label-row">
            <label class="cw-form-label">
              <SvgIcon name="edit" :size="13" />
              <span>邀约说明内容</span>
            </label>
          </div>
          <textarea
            v-model="invitation"
            rows="3"
            class="cw-dir-textarea"
            placeholder="说明群聊主题、建群初衷或希望拉入的街区活动交流..."
          ></textarea>
          <span class="cw-char-counter">{{ invitation.length }} 字</span>
        </div>

        <div class="cw-invite-actions-bar">
          <button
            type="button"
            class="cw-btn cw-btn-primary cw-btn-block"
            :disabled="busy || !inviteAccounts.length || !invitation.trim() || (!inviteGroup && !newGroupName.trim()) || runtime?.view.busy || runtime?.view.updating"
            @click="invite"
          >
            <SvgIcon name="refresh" :size="14" :class="{ 'cw-task-spin': busy }" />
            <span>{{ busy ? '正在发送邀约…' : inviteGroup ? `邀请 ${inviteAccounts.length} 位好友入群` : `创建群聊并邀请 ${inviteAccounts.length} 位好友` }}</span>
          </button>
        </div>
      </article>
    </div>

    <!-- 弹窗确认模态框 -->
    <transition name="cw-dialog-fade">
      <div v-if="confirmation" class="cw-directory-modal-mask">
        <div class="cw-directory-modal-dialog" role="alertdialog" aria-modal="true">
          <div class="cw-modal-icon-badge">
            <SvgIcon name="alertTriangle" :size="24" />
          </div>
          <h4 class="cw-modal-title">操作确认</h4>
          <p class="cw-modal-message">{{ confirmation.message }}</p>
          <div class="cw-modal-btn-row">
            <button
              type="button"
              class="cw-btn cw-btn-ghost cw-modal-btn"
              :disabled="busy"
              @click="confirmation = null"
            >
              取消
            </button>
            <button
              type="button"
              class="cw-btn cw-btn-danger cw-modal-btn"
              :disabled="busy"
              @click="confirmAction"
            >
              {{ busy ? '处理中…' : '确定执行' }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useWorldState } from '../../utils/context';
import { RuntimeKey, type Runtime } from '../../../../运行/host';
import { managePhone } from '../../../../运行/phone-management';
import { phoneProjection } from '../../../../运行/phone';
import CharacterAvatar from '../shared/CharacterAvatar.vue';
import SvgIcon from '../icons/SvgIcon.vue';

const props = defineProps<{
  initialAccount?: string;
  mode?: 'contacts' | 'groups';
  initialGroup?: string;
}>();

const emit = defineEmits<{
  (e: 'chat', accountId: string): void;
  (e: 'openGroupChat', groupId: string): void;
  (e: 'back'): void;
}>();

const state = useWorldState();
const runtime = inject<Runtime | null>(RuntimeKey, null);
const self = computed(() => phoneProjection(state.value).account);
const mode = computed(() => props.mode ?? 'contacts');
const groupSubTab = ref<'joined' | 'invite'>('joined');

const selectedContact = ref('');
const selectedGroup = ref('');
const remarkDraft = ref('');
const inviteAccounts = ref<string[]>([]);
const inviteQuery = ref('');
const inviteGroup = ref('');
const newGroupName = ref('');
const invitation = ref('');
const feedback = ref('');
const feedbackError = ref(false);
const busy = ref(false);
const currentMember = (m: any) => Object.values(m?.成员区间 ?? {}).some((i: any) => i.离开时间 === null);

const contacts = computed(() => Object.entries(state.value.手机.联系人).filter(([, c]) => c.本人账号id === self.value && c.状态 !== '移除'));
const inviteContacts = computed(() => contacts.value.filter(([, c]) => {
  const account = state.value.手机.账号[c.对方账号id];
  return c.状态 === '正常' && account?.平台 === '邻信' && !state.value._系统.角色停用标识[account.人物id] &&
    !currentMember(state.value.手机.群[inviteGroup.value]?.成员[c.对方账号id]);
}));
const filteredInviteContacts = computed(() => {
  const q = inviteQuery.value.trim().toLowerCase();
  return inviteContacts.value.filter(([, c]) => !q || [c.备注, name(c.对方账号id), state.value.手机.账号[c.对方账号id]?.账号名]
    .some(value => (value || '').toLowerCase().includes(q)));
});
watch(inviteContacts, list => {
  const available = new Set(list.map(([, c]) => c.对方账号id));
  inviteAccounts.value = inviteAccounts.value.filter(id => available.has(id));
});
const contact = computed(() => contacts.value.find(([id]) => id === selectedContact.value)?.[1]);
const account = computed(() => contact.value ? state.value.手机.账号[contact.value.对方账号id] : undefined);

const name = (id: string) => {
  const acc = state.value.手机.账号[id];
  const disabled = state.value._系统.角色停用标识[acc?.人物id] ? '（已停用）' : '';
  return (acc?.昵称 || acc?.账号名 || '未知账号') + disabled;
};

// 提取联系人角色身份和层级信息
const contactRoleInfo = computed(() => {
  if (!contact.value) return { identity: '', tier: null };
  const targetId = contact.value.对方账号id;
  const acc = state.value?.手机?.账号?.[targetId];
  const charId = acc?.人物id;
  const person = charId ? (state.value?.角色?.[charId] || (state.value as any)?.['主要角色']?.[charId]) : null;
  const identity = person?.身份 || person?.基础信息?.身份 || acc?.公开资料?.身份 || acc?.公开资料?.职业 || '';
  const tier = person?.层级 || (person ? '主要' : null);
  return { identity, tier };
});

const isRemarkModified = computed(() => {
  const original = contact.value?.备注 || '';
  return remarkDraft.value.trim() !== original.trim();
});

const publicInfoEntries = computed(() => {
  if (!account.value?.公开资料) return [];
  return Object.entries(account.value.公开资料).filter(([k]) => !['简介', '个性签名', '签名'].includes(k));
});

const groups = computed(() => Object.entries(state.value.手机.群).filter(([, g]) => currentMember(g.成员[self.value ?? ''])));
const group = computed(() => groups.value.find(([id]) => id === selectedGroup.value)?.[1]);
const members = computed(() => Object.entries(group.value?.成员 ?? {}).filter(([, m]) => currentMember(m)));
const canManage = computed(() => !!self.value && !!group.value && (group.value.创建者账号id === self.value || group.value.管理员账号id.includes(self.value)));
const canLeaveGroup = computed(() => group.value?.创建者账号id !== self.value || members.value.length <= 1);
function canRemoveMember(id: string) {
  return canManage.value && id !== self.value && id !== group.value?.创建者账号id &&
    (group.value?.创建者账号id === self.value || !group.value?.管理员账号id.includes(id));
}

watch(() => props.initialGroup, id => {
  if (!id) return;
  selectedGroup.value = groups.value.some(([key]) => key === id) ? id : '';
  if (!selectedGroup.value) {
    feedback.value = '当前未加入该群聊，可查看其他已加入的群组';
    feedbackError.value = true;
  }
}, { immediate: true });

watch(
  () => props.initialAccount,
  id => {
    if (id) {
      selectedContact.value = contacts.value.find(([, c]) => c.对方账号id === id)?.[0] ?? '';
    }
  },
  { immediate: true },
);

watch(
  selectedContact,
  () => {
    remarkDraft.value = contact.value?.备注 || '';
  },
  { immediate: true },
);

// 默认选中第一个联系人或群组
watch(
  contacts,
  list => {
    if (!list.some(([id]) => id === selectedContact.value)) selectedContact.value = list[0]?.[0] ?? '';
  },
  { immediate: true },
);

watch(
  groups,
  list => {
    if (!list.some(([id]) => id === selectedGroup.value))
      selectedGroup.value = props.initialGroup && !selectedGroup.value ? '' : list[0]?.[0] ?? '';
    if (inviteGroup.value && !list.some(([id]) => id === inviteGroup.value)) inviteGroup.value = '';
  },
  { immediate: true },
);

const confirmation = ref<{ op: string; id: string; message: string; value?: string } | null>(null);

function ask(op: string, id: string, message: string, value?: string) {
  confirmation.value = { op, id, message, value };
}

async function run(op: string, id: string, value?: string) {
  if (busy.value) return false;
  if (!runtime) {
    feedback.value = '离线展示不保存设置';
    feedbackError.value = true;
    return false;
  }
  busy.value = true;
  try {
    await runtime.commit(s => managePhone(s, op, id, value));
    feedback.value = '设置已更新';
    feedbackError.value = false;
    return true;
  } catch (e) {
    feedback.value = String(e);
    feedbackError.value = true;
    return false;
  } finally {
    busy.value = false;
  }
}

async function confirmAction() {
  const command = confirmation.value;
  if (command && (await run(command.op, command.id, command.value))) {
    confirmation.value = null;
  }
}

function openInvite(groupId = '') {
  inviteGroup.value = groupId;
  groupSubTab.value = 'invite';
}

async function invite() {
  if (busy.value || !inviteAccounts.value.length || !invitation.value.trim() || (!inviteGroup.value && !newGroupName.value.trim())) return;
  if (!runtime) {
    feedback.value = '离线展示不发送邀约';
    feedbackError.value = true;
    return;
  }
  busy.value = true;
  const text = invitation.value.trim();
  const targets = [...inviteAccounts.value];
  const groupId = inviteGroup.value;
  const groupName = newGroupName.value.trim();
  const targetGroup = groupId ? groups.value.find(([id]) => id === groupId)?.[1] : null;
  try {
    if (groupId && !targetGroup) throw Error('当前未加入目标群聊');
    await runtime.phoneAction({
      kind: 'invite',
      platform: '邻信',
      targets,
      groupId: groupId || undefined,
      groupName: groupId ? undefined : groupName,
      text,
    });
    if (invitation.value.trim() === text && inviteGroup.value === groupId && newGroupName.value.trim() === groupName) {
      invitation.value = '';
      inviteAccounts.value = [];
      if (!groupId) newGroupName.value = '';
      if (groupSubTab.value === 'invite') groupSubTab.value = 'joined';
    }
    feedback.value = `已向 ${targets.length} 位好友发送群聊邀约，等待对方确认`;
    feedbackError.value = false;
  } catch (e) {
    feedback.value = String(e);
    feedbackError.value = true;
  } finally {
    busy.value = false;
  }
}

function emitChat(accountId: string) {
  emit('chat', accountId);
}

function emitGroupChat(groupId: string) {
  emit('openGroupChat', groupId);
}
</script>

<style scoped lang="scss">
.cw-directory {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  background: var(--cw-bg-main);
  color: var(--cw-text-primary);
  display: flex;
  flex-direction: column;
  gap: 12px;
}



/* 反馈横幅 */
.cw-directory-feedback-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--cw-radius-sm);
  background: rgba(7, 193, 96, 0.1);
  border: 1px solid rgba(7, 193, 96, 0.25);
  color: #07c160;
  font-size: 12px;

  &.is-error {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.25);
  }

  .cw-btn-close-fb {
    margin-left: auto;
    background: none;
    border: none;
    color: inherit;
    font-size: 14px;
    cursor: pointer;
    line-height: 1;
  }
}

.cw-directory-content {
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  gap: 12px;
}

/* 联系人滑动快捷选择栏 */
.cw-contact-quick-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .cw-picker-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--cw-text-muted);
  }

  .cw-contacts-pill-scroll {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }

    .cw-contact-nav-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px 3px 4px;
      border-radius: var(--cw-radius-full);
      border: 1px solid var(--cw-border);
      background: var(--cw-bg-surface);
      color: var(--cw-text-secondary);
      font-size: 11.5px;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.15s ease;

      .cw-chip-name {
        max-width: 90px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .cw-chip-badge {
        font-size: 10px;
        line-height: 1;
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

/* 个人资料详情大卡片 */
.cw-profile-detail-card,
.cw-group-detail-card,
.cw-invite-form-card {
  padding: 16px;
  border-radius: var(--cw-radius, 12px);
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  box-shadow: var(--cw-shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 头部形象信息 */
.cw-profile-hero,
.cw-group-hero,
.cw-invite-header {
  display: flex;
  align-items: center;
  gap: 14px;
}

.cw-profile-avatar-wrap {
  position: relative;
  flex-shrink: 0;

  .cw-status-indicator {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 13px;
    height: 13px;
    border-radius: var(--cw-radius-full);
    border: 2px solid var(--cw-bg-surface);

    &.is-normal { background: #07c160; }
    &.is-muted { background: #f59e0b; }
    &.is-blocked { background: #ef4444; }
  }
}

.cw-profile-hero-info,
.cw-group-hero-info,
.cw-invite-header-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;

  .cw-hero-title-row,
  .cw-group-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cw-profile-name,
  .cw-group-name,
  .cw-invite-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--cw-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin: 0;
  }

  .cw-profile-handle {
    font-size: 11px;
    color: var(--cw-text-muted);
  }

  .cw-profile-tags-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 2px;
  }
}

.cw-status-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--cw-radius-full);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);
  color: var(--cw-text-secondary);

  &[data-status='正常'],
  &.status-正常 {
    color: #07c160;
    border-color: rgba(7, 193, 96, 0.3);
    background: rgba(7, 193, 96, 0.08);
  }
  &[data-status='拉黑'],
  &.status-拉黑 {
    color: #ef4444;
    border-color: rgba(239, 68, 68, 0.3);
    background: rgba(239, 68, 68, 0.08);
  }
  &.badge-warning {
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.3);
    background: rgba(245, 158, 11, 0.08);
  }
}

.cw-identity-pill {
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: var(--cw-radius-full);
  background: rgba(7, 193, 96, 0.06);
  border: 1px solid rgba(7, 193, 96, 0.2);
  color: #07c160;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 快速发消息主按钮 */
.cw-profile-primary-action {
  .cw-chat-lead-btn {
    width: 100%;
    height: 38px;
    font-size: 13.5px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: #07c160;
    border: none;
    color: #fff;
    border-radius: var(--cw-radius);
    transition: all 0.2s ease;

    &:hover {
      background: #06ad56;
      box-shadow: 0 3px 10px rgba(7, 193, 96, 0.3);
    }
  }
}

/* 分区容器 */
.cw-info-section {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .cw-section-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--cw-text-secondary);

    .cw-link-add-member {
      margin-left: auto;
      background: none;
      border: none;
      color: #07c160;
      font-size: 11px;
      cursor: pointer;
      font-weight: 500;

      &:hover { text-decoration: underline; }
    }
  }
}


/* 公开资料栅格 */
.cw-public-data-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 6px;

  .cw-data-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-card-subtle);
    border: 1px solid var(--cw-border);

    .cw-data-key {
      font-size: 10px;
      color: var(--cw-text-muted);
    }
    .cw-data-val {
      font-size: 11.5px;
      font-weight: 500;
      color: var(--cw-text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

/* 备注修改输入栏 */
.cw-remark-input-row {
  display: flex;
  align-items: center;
  gap: 8px;

  .cw-dir-input {
    flex: 1;
    min-width: 0;
    height: 34px;
    padding: 0 10px;
    border-radius: var(--cw-radius-sm);
    border: 1px solid var(--cw-border);
    background: var(--cw-bg-input, var(--cw-bg-main));
    color: var(--cw-text-primary);
    font-size: 12px;
    outline: none;

    &:focus {
      border-color: #07c160;
    }
  }
}

/* 设置菜单行（类似微信设置面板） */
.cw-settings-menu-list {
  display: flex;
  flex-direction: column;
  border-radius: var(--cw-radius-sm);
  border: 1px solid var(--cw-border);
  overflow: hidden;
  background: var(--cw-bg-card-subtle);

  .cw-setting-menu-row {
    width: 100%;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    cursor: pointer;
    transition: background 0.15s ease;

    &:not(:last-child) {
      border-bottom: 1px solid var(--cw-border);
    }

    &:hover {
      background: var(--cw-bg-surface);
    }

    .cw-setting-label-col {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .cw-setting-title {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--cw-text-primary);
      }
      .cw-setting-desc {
        font-size: 11px;
        color: var(--cw-text-muted);
        line-height: 1.3;
      }
    }
  }
}

/* 拟物切换开关 (iOS Switch) */
.cw-toggle-switch {
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: var(--cw-border);
  border: none;
  position: relative;
  cursor: pointer;
  padding: 2px;
  transition: all 0.2s ease;
  flex-shrink: 0;

  .cw-toggle-thumb {
    display: block;
    width: 18px;
    height: 18px;
    border-radius: 9px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  &.active {
    background: #07c160;

    .cw-toggle-thumb {
      transform: translateX(18px);
    }

    &.switch-danger {
      background: #ef4444;
    }
  }
}

/* 危险操作区 */
.cw-danger-section {
  padding-top: 4px;

  .cw-btn-danger-outline {
    width: 100%;
    height: 36px;
    border: 1px solid rgba(239, 68, 68, 0.4);
    background: transparent;
    color: var(--cw-danger, #ef4444);
    border-radius: var(--cw-radius);
    font-size: 12.5px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(239, 68, 68, 0.08);
      border-color: #ef4444;
    }
  }
}

/* 群聊二级 Tab */
.cw-group-subtabs {
  display: flex;
  gap: 8px;
  background: var(--cw-bg-card-subtle);
  padding: 3px;
  border-radius: var(--cw-radius-full);
  border: 1px solid var(--cw-border);

  .cw-subtab-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 10px;
    border: none;
    border-radius: var(--cw-radius-full);
    background: transparent;
    font-size: 12px;
    color: var(--cw-text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover { color: var(--cw-text-primary); }

    &.active {
      background: var(--cw-bg-surface);
      color: #07c160;
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
  }
}

.cw-group-selector-box {
  display: flex;
  align-items: center;
  gap: 8px;

  .cw-group-select-label {
    font-size: 12px;
    color: var(--cw-text-muted);
    white-space: nowrap;
  }
}

.cw-dir-select {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border-radius: var(--cw-radius-sm);
  border: 1px solid var(--cw-border);
  background: var(--cw-bg-surface);
  color: var(--cw-text-primary);
  font-size: 12px;
  outline: none;

  &:focus { border-color: #07c160; }
}

.cw-group-avatar-badge {
  width: 48px;
  height: 48px;
  border-radius: var(--cw-radius-full);
  background: linear-gradient(135deg, rgba(7, 193, 96, 0.15) 0%, rgba(7, 193, 96, 0.3) 100%);
  border: 1px solid rgba(7, 193, 96, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #07c160;
  flex-shrink: 0;
}

.cw-group-role-tag {
  display: flex;
  gap: 4px;
  margin-top: 2px;

  .cw-role-chip {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;

    &.owner {
      background: rgba(245, 158, 11, 0.12);
      color: #d97706;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    &.admin {
      background: rgba(59, 130, 246, 0.12);
      color: #2563eb;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    &.member {
      background: var(--cw-bg-card-subtle);
      color: var(--cw-text-muted);
      border: 1px solid var(--cw-border);
    }
  }
}

.cw-notice-card {
  padding: 10px 12px;
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  border: 1px solid var(--cw-border);

  .cw-notice-body {
    margin: 0;
    font-size: 12px;
    color: var(--cw-text-primary);
    line-height: 1.5;
  }
}

/* 群成员矩阵 */
.cw-members-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
  gap: 10px;
  padding: 4px 0;

  .cw-member-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 4px;
    border-radius: var(--cw-radius-sm);
    background: var(--cw-bg-card-subtle);
    border: 1px solid var(--cw-border);
    transition: all 0.15s ease;

    &:hover {
      border-color: #07c160;
    }

    &.is-me {
      border-color: rgba(7, 193, 96, 0.4);
      background: rgba(7, 193, 96, 0.04);
    }

    .cw-member-avatar-wrap {
      position: relative;

      .cw-member-role-mark {
        position: absolute;
        top: -4px;
        right: -6px;
        font-size: 11px;
        line-height: 1;
      }
    }

    .cw-member-tile-info {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;

      .cw-member-tile-name {
        font-size: 11px;
        color: var(--cw-text-primary);
        max-width: 60px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: center;
      }
      .cw-me-indicator {
        font-size: 9.5px;
        color: #07c160;
        font-weight: 600;
      }
    }

    .cw-btn-remove-member {
      position: absolute;
      top: -4px;
      left: -4px;
      width: 16px;
      height: 16px;
      border-radius: 8px;
      background: #ef4444;
      color: #fff;
      border: none;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      line-height: 1;

      &:hover { transform: scale(1.1); }
    }

    &.add-tile {
      border-style: dashed;
      cursor: pointer;
      justify-content: center;

      &:hover {
        border-color: #07c160;
        .cw-add-member-circle {
          background: #07c160;
          color: #fff;
        }
      }

      .cw-add-member-circle {
        width: 32px;
        height: 32px;
        border-radius: var(--cw-radius-full);
        background: var(--cw-bg-surface);
        border: 1px dashed var(--cw-border-hover);
        color: var(--cw-text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }

      .cw-add-member-text {
        font-size: 11px;
        color: var(--cw-text-secondary);
      }
    }
  }
}

/* 邀约卡片 */
.cw-invite-header {
  .cw-invite-icon-badge {
    width: 44px;
    height: 44px;
    border-radius: var(--cw-radius-full);
    background: linear-gradient(135deg, rgba(7, 193, 96, 0.15) 0%, rgba(7, 193, 96, 0.3) 100%);
    border: 1px solid rgba(7, 193, 96, 0.3);
    color: #07c160;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .cw-invite-desc {
    margin: 0;
    font-size: 11.5px;
    color: var(--cw-text-muted);
    line-height: 1.4;
  }
}

.cw-invite-form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .cw-form-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px;
  }

  .cw-form-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--cw-text-secondary);
  }


  .cw-dir-textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border-radius: var(--cw-radius-sm);
    border: 1px solid var(--cw-border);
    background: var(--cw-bg-input, var(--cw-bg-main));
    color: var(--cw-text-primary);
    font: inherit;
    font-size: 12px;
    outline: none;
    resize: vertical;

    &:focus {
      border-color: #07c160;
    }
  }

  .cw-char-counter {
    align-self: flex-end;
    font-size: 10px;
    color: var(--cw-text-muted);
  }
}

.cw-invite-actions-bar {
  margin-top: 4px;
}

/* 空态背景 */
.cw-invite-target-select,
.cw-invite-name-input {
  min-height: 48px;
  padding: 10px 12px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.cw-invite-contact-list {
  min-height: 180px;
  max-height: 280px;
  overflow-y: auto;
  padding: 8px;
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius-sm);
  background: var(--cw-bg-card-subtle);
  flex-shrink: 0;
}
.cw-invite-contact-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 6px 8px;
  border-radius: var(--cw-radius-sm);
  cursor: pointer;
  color: var(--cw-text-primary);
  &.selected { background: rgba(7, 193, 96, 0.1); }
  input { width: 18px; height: 18px; flex-shrink: 0; accent-color: #07c160; }
  > span { overflow-wrap: anywhere; min-width: 0; }
}

.cw-empty-backdrop {
  flex: 1;
  width: 100%;
  min-height: 200px;
  box-sizing: border-box;
  padding: 32px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;

  .cw-empty-icon-wrap {
    color: var(--cw-text-muted);
    opacity: 0.4;
    margin-bottom: 12px;
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

/* 操作确认弹窗模态框 */
.cw-directory-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.cw-directory-modal-dialog {
  width: 100%;
  max-width: 320px;
  background: var(--cw-bg-surface);
  border: 1px solid var(--cw-border);
  border-radius: var(--cw-radius, 12px);
  padding: 20px 18px;
  box-shadow: var(--cw-shadow-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;

  .cw-modal-icon-badge {
    color: #ef4444;
  }

  .cw-modal-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--cw-text-primary);
    margin: 0;
  }

  .cw-modal-message {
    font-size: 12.5px;
    color: var(--cw-text-secondary);
    line-height: 1.5;
    margin: 0;
  }

  .cw-modal-btn-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin-top: 6px;

    .cw-modal-btn {
      flex: 1;
      height: 34px;
      font-size: 12.5px;
      border-radius: var(--cw-radius-sm);
    }
  }
}

/* 动效 */
.cw-dialog-fade-enter-active,
.cw-dialog-fade-leave-active {
  transition: opacity 0.2s ease;
  .cw-directory-modal-dialog {
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}

.cw-dialog-fade-enter-from,
.cw-dialog-fade-leave-to {
  opacity: 0;
  .cw-directory-modal-dialog {
    transform: scale(0.92);
  }
}

.cw-fade-enter-active,
.cw-fade-leave-active {
  transition: opacity 0.2s ease;
}
.cw-fade-enter-from,
.cw-fade-leave-to {
  opacity: 0;
}

/* 暗色主题适配 */
[data-theme='dark'] {

  .cw-group-subtabs {
    background: rgba(255, 255, 255, 0.04);
    .cw-subtab-btn.active {
      background: rgba(255, 255, 255, 0.08);
      color: #10b981;
    }
  }

  .cw-toggle-switch {
    background: rgba(255, 255, 255, 0.15);
  }

  .cw-directory-modal-dialog {
    background: #1e293b;
    border-color: rgba(255, 255, 255, 0.1);
  }
}
</style>
