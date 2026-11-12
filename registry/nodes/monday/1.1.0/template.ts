export default async function (ctx) {
  const apiToken = ctx.env.MONDAY_API_TOKEN
  const action = ctx.config.action

  async function mondayRequest(query: string, variables?: Record<string, unknown>) {
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        Authorization: apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    })
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(`Monday.com API error: ${response.statusText}`)
    }
    if (data.errors) {
      const errors = data.errors as Array<{ message: string }>
      throw new Error(`Monday.com GraphQL error: ${errors[0].message}`)
    }
    return data.data as Record<string, unknown>
  }

  function formatColumnValues(values: unknown): string {
    if (typeof values === 'string') return values
    return JSON.stringify(values)
  }

  switch (action) {
    case 'Create Item': {
      const columnValues = ctx.config.columnValues
        ? formatColumnValues(ctx.config.columnValues)
        : '{}'
      const groupId = ctx.config.groupId
      const data = await mondayRequest(
        `mutation ($boardId: ID!, $groupId: String, $itemName: String!, $columnValues: JSON) {
          create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) {
            id name
          }
        }`,
        {
          boardId: ctx.config.boardId,
          groupId: groupId || undefined,
          itemName: ctx.config.itemName,
          columnValues,
        },
      )
      const item = data.create_item as { id: string }
      return { id: item.id, data }
    }

    case 'Get Item': {
      const data = await mondayRequest(
        `query ($ids: [ID!]) {
          items(ids: $ids) {
            id name column_values { id title text value }
            group { id title }
            board { id name }
          }
        }`,
        { ids: [ctx.config.itemId] },
      )
      const items = data.items as Array<{ id: string }>
      return { id: items[0]?.id ?? null, data }
    }

    case 'Update Item': {
      const columnValues = ctx.config.columnValues
        ? formatColumnValues(ctx.config.columnValues)
        : '{}'
      const data = await mondayRequest(
        `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
          change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
            id name
          }
        }`,
        {
          boardId: ctx.config.boardId,
          itemId: ctx.config.itemId,
          columnValues,
        },
      )
      const item = data.change_multiple_column_values as { id: string }
      return { id: item.id, data }
    }

    case 'List Items': {
      const data = await mondayRequest(
        `query ($boardIds: [ID!]) {
          boards(ids: $boardIds) {
            items_page(limit: 100) {
              items { id name column_values { id title text value } group { id title } }
            }
          }
        }`,
        { boardIds: [ctx.config.boardId] },
      )
      return { id: null, data }
    }

    case 'Delete Item': {
      if (!ctx.config.itemId) throw new Error('Item ID is required for Delete Item')
      const data = await mondayRequest(
        `mutation ($itemId: ID!) {
          delete_item(item_id: $itemId) { id }
        }`,
        { itemId: ctx.config.itemId },
      )
      return { id: String(ctx.config.itemId), data }
    }

    case 'List Boards': {
      const data = await mondayRequest(
        `query {
          boards(limit: 50) { id name }
        }`,
      )
      return { id: null, data }
    }

    case 'Create Board': {
      if (!ctx.config.boardName) throw new Error('Board Name is required for Create Board')
      const data = await mondayRequest(
        `mutation ($boardName: String!) {
          create_board(board_name: $boardName, board_kind: public) { id name }
        }`,
        { boardName: ctx.config.boardName },
      )
      const board = data.create_board as { id: string }
      return { id: board.id, data }
    }

    case 'Add Update': {
      if (!ctx.config.itemId) throw new Error('Item ID is required for Add Update')
      const data = await mondayRequest(
        `mutation ($itemId: ID!, $body: String!) {
          create_update(item_id: $itemId, body: $body) { id }
        }`,
        { itemId: ctx.config.itemId, body: ctx.config.updateBody },
      )
      const update = data.create_update as { id: string }
      return { id: update.id, data }
    }

    default:
      throw new Error(`Unknown action: ${action}`)
  }
}
