import type { TemplateIconName } from '@awaitstep/templates'
import {
  Building2,
  CreditCard,
  Download,
  Gauge,
  HeartHandshake,
  Hourglass,
  MailPlus,
  MessageSquare,
  Send,
  ShoppingBag,
  ShoppingCart,
  Siren,
  UserCheck,
  UserPlus,
  UserX,
  Webhook,
  type LucideIcon,
} from 'lucide-react'

export {
  REGISTRY_NODES,
  templateCategories,
  templateRegistryNodes,
  workflowTemplates,
  type TemplateCategory,
  type TemplateCategoryId,
  type TemplateIconName,
  type WorkflowTemplate,
} from '@awaitstep/templates'

/** The dashboard's drawing of each template icon the templates package names. */
export const TEMPLATE_ICONS: Record<TemplateIconName, LucideIcon> = {
  'building-2': Building2,
  'credit-card': CreditCard,
  download: Download,
  gauge: Gauge,
  'heart-handshake': HeartHandshake,
  hourglass: Hourglass,
  'mail-plus': MailPlus,
  'message-square': MessageSquare,
  send: Send,
  'shopping-bag': ShoppingBag,
  'shopping-cart': ShoppingCart,
  siren: Siren,
  'user-check': UserCheck,
  'user-plus': UserPlus,
  'user-x': UserX,
  webhook: Webhook,
}
